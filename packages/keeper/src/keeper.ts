// One keeper pass over every Plinth vault: pull out of unhealthy lending markets, set each vault's
// multiplier from the event policy, and rebalance vaults whose stock leg drifted outside the band.
// Every write is simulated first; a revert (for example a price check refusing a manipulated pool) is
// logged and retried on the next pass, never forced.
import {
  createPublicClient, createWalletClient, http, formatUnits, getAddress, encodeFunctionData,
  type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { factoryAbi, vaultAbi } from './abi.js';
import { decide, needsTrade, type RiskEvent } from './policy.js';
import { earningsEvents, haltEvents, macroEvents } from './events.js';

const WAD = 10n ** 18n;
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
}

export interface Action {
  vault: Address;
  symbol: string;
  kind: 'pull-out' | 'set-multiplier' | 'rebalance';
  detail: string;
  tx?: Hex;
  status: 'sent' | 'would-send' | 'simulation-reverted' | 'failed';
  error?: string;
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
    this.pub = createPublicClient({ chain: bsc, transport: http(cfg.rpcUrl) }) as PublicClient;
    if (cfg.privateKey) {
      // Keys arrive from env; accept them with or without 0x.
      this.account = privateKeyToAccount(cfg.privateKey);
      this.wallet = createWalletClient({ account: this.account, chain: bsc, transport: http(cfg.rpcUrl) });
    }
  }

  private now() {
    return this.cfg.now ? this.cfg.now() : Math.floor(Date.now() / 1000);
  }

  /** All risk events that matter from yesterday to three days out. */
  async events(symbols: string[]) {
    const now = this.now();
    const days = [-1, 0, 1, 2, 3].map((d) => new Date((now + d * 86400) * 1000));
    const earn = await earningsEvents(symbols, days);
    const halts = await haltEvents(this.cfg.relay, this.stocks.stocks.filter((s) => symbols.includes(s.sym)).map((s) => ({ symbol: s.sym, token: s.token })));
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
    const canSend = this.cfg.sender || (this.wallet && this.account);
    if (this.cfg.dryRun || !canSend) return { ...a, status: 'would-send' };
    try {
      const data = encodeFunctionData({ abi: vaultAbi, functionName: fn as any, args: args as any });
      const tx = this.cfg.sender
        ? await this.cfg.sender.send({ to: vault, data })
        : await this.wallet!.sendTransaction({ to: vault, data, account: this.account!, chain: bsc });
      const r = await this.pub.waitForTransactionReceipt({ hash: tx, timeout: 60_000 });
      return { ...a, tx, status: r.status === 'success' ? 'sent' : 'failed' };
    } catch (e) {
      return { ...a, status: 'failed', error: (e as any).shortMessage ?? String(e) };
    }
  }

  async pass(): Promise<PassReport> {
    const block = await this.pub.getBlockNumber();
    this.keeperAddress = await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'keeper' });
    const count = await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'vaultCount' });
    const minTrade = num(await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'minTrade' }));
    const vaults: Address[] = [];
    for (let i = 0n; i < count; i++) {
      vaults.push(await this.pub.readContract({ address: this.cfg.factory, abi: factoryAbi, functionName: 'vaults', args: [i] }));
    }

    const info = await Promise.all(vaults.map(async (v) => {
      const [s, stock] = await Promise.all([
        this.pub.readContract({ address: v, abi: vaultAbi, functionName: 'status' }),
        this.pub.readContract({ address: v, abi: vaultAbi, functionName: 'stock' }),
      ]);
      const symbol = this.stocks.byToken.get(getAddress(stock.token)) ?? stock.token;
      return { v, s, stock, symbol };
    }));

    const symbols = [...new Set(info.map((i) => i.symbol))];
    const ev = await this.events(symbols);
    const actions: Action[] = [];

    for (const { v, s, stock, symbol } of info) {
      if (s.promised === 0n) continue; // emptied vault

      // 1. Safe leg health: anyone may pull out; the keeper does it the moment the gate fails.
      if (s.gateCode !== 0) {
        actions.push(await this.write(v, 'pullOutIfUnhealthy', [], { vault: v, symbol, kind: 'pull-out', detail: `gate code ${s.gateCode}` }));
      }

      // 2. Multiplier from the event policy, never above the vault's cap (the contract enforces it too).
      const cap = num(s.cap);
      const want = decide({ symbol, cap, eventCap: this.stocks.eventCap.get(symbol) ?? cap }, ev.events, this.now());
      const wantWad = BigInt(Math.round(want.multiplier * 10)) * (WAD / 10n);
      let multiplier = s.multiplier;
      // Fail closed: if any event source could not be read, the keeper may lower but not raise.
      const blindRaise = ev.errors.length > 0 && wantWad > s.multiplier;
      if (wantWad !== s.multiplier && !blindRaise) {
        const a = await this.write(v, 'setMultiplier', [wantWad], {
          vault: v, symbol, kind: 'set-multiplier',
          detail: `${num(s.multiplier)} -> ${want.multiplier}: ${want.reason}`,
        });
        actions.push(a);
        if (a.status === 'sent' || a.status === 'would-send') multiplier = wantWad;
      }

      // 3. Rebalance when the stock leg is outside the band of the target at the multiplier now in force.
      const cushion = s.total > s.floor ? s.total - s.floor : 0n;
      let target = (multiplier * cushion) / WAD;
      if (target > s.total) target = s.total;
      if (needsTrade(num(s.stockUsd), num(target), num(stock.band), minTrade)) {
        actions.push(await this.write(v, 'rebalance', [], {
          vault: v, symbol, kind: 'rebalance',
          detail: `stock $${num(s.stockUsd).toFixed(2)} vs target $${num(target).toFixed(2)}`,
        }));
      }
    }

    return {
      at: new Date(this.now() * 1000).toISOString(),
      block: block.toString(),
      vaults: vaults.length,
      actions,
      statuses: ev.statuses,
      events: ev.events.filter((e) => Math.abs(e.at - this.now()) < 4 * 86400),
      errors: ev.errors,
    };
  }
}
