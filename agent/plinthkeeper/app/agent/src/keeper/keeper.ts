// Copied from packages/keeper/src/keeper.ts by scripts/sync-agent.sh. Edit the original.
// One keeper pass over every Plinth vault: pull out of unhealthy lending markets, set each vault's
// multiplier from the event policy (cuts at once, raises one step per interval, as the vault allows), and
// rebalance vaults whose stock leg drifted outside the band, repeating while a big move needs more than
// one trade.
// Every write is simulated first; a revert (for example a price check refusing a manipulated pool) is
// logged and retried on the next pass, never forced.
import {
  createPublicClient, createWalletClient, http, formatUnits, getAddress, encodeFunctionData,
  type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { factoryAbi, vaultAbi } from './abi.js';
import { decide, needsTrade, nextMultiplier, type RiskEvent } from './policy.js';
import { earningsEvents, haltEvents, macroEvents } from './events.js';

const WAD = 10n ** 18n;
/** Most trades one vault gets in one pass. Each is at most the stock's maxTrade and priced afresh. */
const MAX_TRADES_PER_PASS = 5;
/** Longest the keeper waits for earnings and trading-status sources before acting without them. */
const EVENTS_DEADLINE_MS = 20_000;
const num = (x: bigint, d = 18) => Number(formatUnits(x, d));
import { stocks, gaps } from './data.js';

/** Signs and broadcasts one call; returns the tx hash. Lets a host (e.g. an Agent Studio wallet) sign. */
export type Sender = (call: { to: Address; data: Hex }) => Promise<Hex>;

export interface KeeperConfig {
  rpcUrl: string;
  factory: Address;
  relay: string;
  /** Without a key or a sender the keeper only reads and reports what it would do. */
  privateKey?: Hex;
  sender?: { address: Address; send: Sender };
  dryRun: boolean;
  now?: () => number;
  /** Tests inject a client and a shorter event deadline. */
  client?: PublicClient;
  eventsDeadlineMs?: number;
}

export interface Action {
  vault: Address;
  symbol: string;
  kind: 'pull-out' | 'set-multiplier' | 'rebalance';
  detail: string;
  tx?: Hex;
  status: 'sent' | 'would-send' | 'simulation-reverted' | 'failed';
  error?: string;
  /** The Binance Web3 API's own simulation of this call (Transaction API), run before sending. */
  web3Simulation?: string;
}

export interface PassReport {
  at: string;
  block: string;
  vaults: number;
  actions: Action[];
  statuses: Record<string, string>;
  events: RiskEvent[];
  errors: string[];
}

function loadStocks() {
  const byToken = new Map(stocks.map((s) => [getAddress(s.token), s.sym]));
  const eventCap = new Map(gaps.map((g) => [g.sym, g.eventCap]));
  return { stocks, byToken, eventCap };
}

export class Keeper {
  readonly pub: PublicClient;
  readonly wallet?: WalletClient;
  readonly account?: PrivateKeyAccount;
  private readonly stocks = loadStocks();
  private keeperAddress?: Address;

  constructor(private readonly cfg: KeeperConfig) {
    this.pub = cfg.client ?? (createPublicClient({ chain: bsc, transport: http(cfg.rpcUrl), batch: { multicall: true } }) as PublicClient);
    if (cfg.privateKey) {
      // Keys arrive from env; accept them with or without 0x.
      this.account = privateKeyToAccount(cfg.privateKey);
      this.wallet = createWalletClient({ account: this.account, chain: bsc, transport: http(cfg.rpcUrl) });
    }
  }

  private now() {
    return this.cfg.now ? this.cfg.now() : Math.floor(Date.now() / 1000);
  }

  /** All risk events that matter from yesterday to three days out. Bounded: if the sources do not answer within
   *  EVENTS_DEADLINE_MS the pass goes on with the scheduled macro calendar only and records the failure, which
   *  blocks multiplier raises for that pass (fail closed). */
  async events(symbols: string[]) {
    const now = this.now();
    const days = [-1, 0, 1, 2, 3].map((d) => new Date((now + d * 86400) * 1000));
    const fetched = Promise.all([
      earningsEvents(symbols, days),
      haltEvents(this.cfg.relay, this.stocks.stocks.filter((s) => symbols.includes(s.sym)).map((s) => ({ symbol: s.sym, token: s.token }))),
    ]);
    const deadline = this.cfg.eventsDeadlineMs ?? EVENTS_DEADLINE_MS;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), deadline));
    const got = await Promise.race([fetched, timeout]);
    if (!got) return { events: macroEvents(), statuses: {} as Record<string, string>, errors: [`event sources did not answer within ${deadline / 1000}s`] };
    const [earn, halts] = got;
    return {
      events: [...macroEvents(), ...earn.events, ...halts.events],
      statuses: halts.statuses,
      errors: [...earn.errors, ...halts.errors],
    };
  }

  private async write(vault: Address, fn: 'rebalance' | 'pullOutIfUnhealthy' | 'setMultiplier', args: readonly unknown[], a: Omit<Action, 'status'>): Promise<Action> {
    const from = this.cfg.sender?.address ?? this.account?.address ?? this.keeperAddress;
    try {
      await this.pub.simulateContract({ address: vault, abi: vaultAbi, functionName: fn as any, args: args as any, account: from });
    } catch (e) {
      return { ...a, status: 'simulation-reverted', error: (e as any).shortMessage ?? String(e) };
    }
    // Second opinion from the Binance Web3 API's Transaction API. A FAIL there blocks the send; if the API
    // cannot be reached the on-chain simulation above stands, and the action records that.
    const data = encodeFunctionData({ abi: vaultAbi, functionName: fn as any, args: args as any });
    const web3Simulation = await this.web3Simulate(from!, vault, data);
    if (web3Simulation.startsWith('FAIL')) return { ...a, status: 'simulation-reverted', web3Simulation, error: web3Simulation };
    const canSend = this.cfg.sender || (this.wallet && this.account);
    if (this.cfg.dryRun || !canSend) return { ...a, status: 'would-send', web3Simulation };
    try {
      const tx = this.cfg.sender
        ? await this.cfg.sender.send({ to: vault, data })
        : await this.wallet!.sendTransaction({ to: vault, data, account: this.account!, chain: bsc });
      const r = await this.pub.waitForTransactionReceipt({ hash: tx, timeout: 60_000 });
      return { ...a, tx, status: r.status === 'success' ? 'sent' : 'failed', web3Simulation };
    } catch (e) {
      return { ...a, status: 'failed', error: (e as any).shortMessage ?? String(e), web3Simulation };
    }
  }

  /** POST /api/v1/dex/pre-transaction/simulate through the relay. Returns 'SUCCESS', 'FAIL: <reason>' or
   *  'unavailable: <reason>'. */
  private async web3Simulate(from: Address, to: Address, data: Hex): Promise<string> {
    try {
      const r = await fetch(`${this.cfg.relay}/api/web3`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: '/api/v1/dex/pre-transaction/simulate',
          body: { binanceChainId: '56', evmTx: { from, to, value: '0', data } },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const j: any = await r.json();
      if (j?.code !== 0) return `unavailable: ${j?.code ?? r.status} ${j?.msg ?? j?.error ?? ''}`.trim();
      return j.data?.status === 'SUCCESS' ? 'SUCCESS' : `FAIL: ${j.data?.failReason || j.data?.status}`;
    } catch (e) {
      return `unavailable: ${(e as Error).message}`;
    }
  }

  async pass(): Promise<PassReport> {
    const block = await this.pub.getBlockNumber();
    this.keeperAddress = await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'keeper' });
    const count = await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'vaultCount' });
    const minTrade = num(await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'minTrade' }));
    // Batched into multicalls by the client.
    const vaults: Address[] = await Promise.all(Array.from({ length: Number(count) }, (_, i) =>
      this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'vaults', args: [BigInt(i)] })));

    // Each vault is read on its own: one that cannot be read (stale feed, broken pool, bad market) is reported and
    // skipped, and every other vault is still defended.
    const errors: string[] = [];
    const settled = await Promise.allSettled(vaults.map(async (v) => {
      const [s, stock] = await Promise.all([
        this.pub.readContract({ address: v, abi: vaultAbi, functionName: 'status' }),
        this.pub.readContract({ address: v, abi: vaultAbi, functionName: 'stock' }),
      ]);
      const symbol = this.stocks.byToken.get(getAddress(stock.token)) ?? stock.token;
      return { v, s, stock, symbol };
    }));
    const info = settled.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value.s.promised === 0n ? [] : [r.value];
      errors.push(`vault ${vaults[i]} unreadable: ${(r.reason as any)?.shortMessage ?? String(r.reason).slice(0, 200)}`);
      return [];
    });
    const actions: Action[] = [];

    // 1. Safety first, before any off-chain data: leave unhealthy lending markets (anyone may; the keeper does it
    //    the moment a gate fails). Nothing here waits on an event source.
    for (const { v, s, symbol } of info) {
      if (s.gateCode === 0) continue;
      try {
        actions.push(await this.write(v, 'pullOutIfUnhealthy', [], { vault: v, symbol, kind: 'pull-out', detail: `gate code ${s.gateCode}` }));
      } catch (e) {
        errors.push(`vault ${v} pull-out: ${(e as Error).message}`);
      }
    }

    // 2. Event risk (bounded by EVENTS_DEADLINE_MS), then multipliers and rebalances, one vault at a time.
    const ev = await this.events([...new Set(info.map((i) => i.symbol))]);
    errors.push(...ev.errors);
    const me = this.cfg.sender?.address ?? this.account?.address;
    const isKeeper = !!me && !!this.keeperAddress && me.toLowerCase() === this.keeperAddress.toLowerCase();

    for (const { v, s, stock, symbol } of info) {
      try {
        // Multiplier from the event policy, never above the vault's cap (the contract enforces it too). A backup
        // keeper (any wallet that is not the factory's keeper) makes only the calls anyone may make.
        const cap = num(s.cap);
        const want = decide({ symbol, cap, eventCap: this.stocks.eventCap.get(symbol) ?? cap }, ev.events, this.now());
        const next = !s.exiting && (isKeeper || !me) ? nextMultiplier(num(s.multiplier), want.multiplier, Number(s.nextRaiseAt), this.now()) : null;
        let multiplier = s.multiplier;
        // Fail closed: if any event source could not be read, the keeper may lower but not raise.
        const blindRaise = ev.errors.length > 0 && next !== null && next > num(s.multiplier);
        if (next !== null && !blindRaise) {
          const nextWad = BigInt(Math.round(next * 10)) * (WAD / 10n);
          const stepNote = next < want.multiplier ? ` (one step toward ${want.multiplier})` : '';
          const a = await this.write(v, 'setMultiplier', [nextWad], {
            vault: v, symbol, kind: 'set-multiplier',
            detail: `${num(s.multiplier)} -> ${next}${stepNote}: ${want.reason}`,
          });
          actions.push(a);
          if (a.status === 'sent' || a.status === 'would-send') multiplier = nextWad < s.cap ? nextWad : s.cap;
        }

        // Rebalance when the stock leg is outside the band of the target at the multiplier now in force (zero during
        // a staged exit). A move bigger than one trade (maxTrade) takes several; each re-reads the vault.
        let cur = s;
        for (let t = 0; t < MAX_TRADES_PER_PASS; t++) {
          const m = cur.exiting ? 0n : multiplier;
          const cushion = cur.total > cur.floor ? cur.total - cur.floor : 0n;
          let target = (m * cushion) / WAD;
          if (target > cur.total) target = cur.total;
          if (!needsTrade(num(cur.stockUsd), num(target), num(stock.band), minTrade)) break;
          const a = await this.write(v, 'rebalance', [], {
            vault: v, symbol, kind: 'rebalance',
            detail: `${cur.exiting ? 'staged exit: ' : ''}stock $${num(cur.stockUsd).toFixed(2)} vs target $${num(target).toFixed(2)}`,
          });
          actions.push(a);
          if (a.status !== 'sent') break;
          cur = await this.pub.readContract({ address: v, abi: vaultAbi, functionName: 'status' });
        }
      } catch (e) {
        errors.push(`vault ${v}: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    return {
      at: new Date(this.now() * 1000).toISOString(),
      block: block.toString(),
      vaults: vaults.length,
      actions,
      statuses: ev.statuses,
      events: ev.events.filter((e) => Math.abs(e.at - this.now()) < 4 * 86400),
      errors,
    };
  }

}
