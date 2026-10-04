import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { BSCSCAN, GATE_CODES, RELAY, client, factoryAbi, rwaPrice, sellQuote, vaultStatus } from '../chain';
import { NAMES, symOf } from '../data';
import { pct, short, usd } from '../format';
import { CountUp, Reveal } from '../motion';
import { canWithdraw, hasWallet, withdraw, withdrawInKind } from '../wallet';
import { connect, useAccount } from '../account';
import { Footer } from './Front';

type Status = Awaited<ReturnType<typeof vaultStatus>>;
const MARKETS = ['Plain USDT (earning nothing)', 'Venus', 'Aave'];

interface LogRow { event: string; block: number; tx: string; time?: number; detail: string; logIndex?: number }
interface Exit { value: number; cost: number; vendor: string }

const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export function VaultPage({ address, demo }: { address: Address; demo?: boolean }) {
  const [v, setV] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [keeper, setKeeper] = useState<Address | null>(null);
  const [exit, setExit] = useState<Exit | null | 'unavailable'>(null);
  const [ref, setRef] = useState<{ tokenPrice: number; referencePrice: number } | null>(null);
  const [normalOk, setNormalOk] = useState<boolean | null>(null);
  const [wd, setWd] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { account } = useAccount();

  useEffect(() => {
    const load = () => vaultStatus(address).then((x) => { setV(x); setReadAt(new Date()); setError(null); }).catch((e) => setError(String(e?.shortMessage ?? e?.message ?? e)));
    load();
    const t = setInterval(load, 30_000);
    fetch(`${RELAY}/api/vault-log?vault=${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history service answered ${r.status}`))))
      .then((d) => setLog(d.rows))
      .catch((e) => setLogError(String(e.message ?? e)));
    return () => clearInterval(t);
  }, [address, tick]);

  // The keeper is whoever the vault's own factory names.
  useEffect(() => {
    client.readContract({ address, abi: [{ type: 'function', name: 'factory', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' }] as const, functionName: 'factory' })
      .then((f) => client.readContract({ address: f, abi: factoryAbi, functionName: 'keeper' }))
      .then(setKeeper).catch(() => setKeeper(null));
  }, [address]);

  // Leaving today: the safe leg comes back as USDT; the stock leg is priced by a live Binance Web3 API quote.
  const tokens = v && v.s.price > 0n ? Number(v.s.stockUsd) / Number(v.s.price) : 0;
  const token = v?.stock.token;
  useEffect(() => {
    if (!v || !token) return;
    const safe = Number(v.s.safeUsd) / 1e18;
    if (tokens <= 0) { setExit({ value: safe, cost: 0, vendor: '' }); return; }
    sellQuote(token, tokens)
      .then((q) => setExit(q ? { value: safe + q.usdtOut, cost: q.cost, vendor: q.vendor } : 'unavailable'))
      .catch(() => setExit('unavailable'));
    rwaPrice(token).then(setRef).catch(() => setRef(null));
  }, [token, Math.round(tokens * 1e4)]);

  const isSaver = !!account && !!v && account.toLowerCase() === v.saver.toLowerCase();
  useEffect(() => {
    if (isSaver) canWithdraw(account!, address, 1).then(setNormalOk);
  }, [isSaver, address, tick]);

  const n = (x: bigint) => Number(x) / 1e18;
  const sym = v ? symOf(v.stock.token) : undefined;
  const name = sym ? NAMES[sym] ?? sym : 'the stock';

  const run = async (label: string, fn: () => Promise<string>) => {
    setWd(label);
    try { const h = await fn(); setWd(`Done: ${BSCSCAN}/tx/${h}`); setTick((t) => t + 1); }
    catch (e) { setWd(String((e as { shortMessage?: string })?.shortMessage ?? (e as Error).message).split('\n')[0]); }
  };

  return (
    <section className="page vault">
      {demo && <p className="banner">Live: a real vault on BSC mainnet. Everything here is read from the chain every 30 seconds.</p>}
      <h1>{sym ? `${name} vault` : 'Vault'} <a className="addr" href={`${BSCSCAN}/address/${address}`}>{short(address)}</a></h1>
      {error && <p className="fail">Could not read this vault: {error}</p>}
      {!v && !error && <p className="muted">Reading the vault from BSC…</p>}
      {v && (() => {
        const s = v.s;
        const total = n(s.total), floor = n(s.floor), stockUsd = n(s.stockUsd);
        const bd = s.breakDistance > 10n ** 30n ? null : n(s.breakDistance);
        const now = Date.now() / 1000;
        const raiseAt = Number(s.nextRaiseAt);
        return (
          <>
            <div className="dash">
              <Reveal className="card black"><span>Value now</span><strong><CountUp value={total} format={(x) => usd(x, 2)} /></strong><small>in USDT, read {readAt?.toISOString().slice(11, 19)} UTC</small></Reveal>
              <Reveal className="card" delay={80}><span>Floor today</span><strong><CountUp value={floor} format={(x) => usd(x, 2)} /></strong><small>the line the vault defends; it grows to {usd(n(s.promised), 2)} by {new Date(Number(s.maturity) * 1000).toISOString().slice(0, 10)}</small></Reveal>
              <Reveal className="card" delay={160}>
                <span>Break distance</span>
                <strong>{bd === null ? 'no stock' : <CountUp value={bd * 100} format={(x) => x.toFixed(1) + '%'} />}</strong>
                <small>the single drop in {name} that would touch the floor today</small>
                {bd !== null && <div className="meter"><i style={{ width: `${Math.min(100, bd * 100 * 2.5)}%` }} /></div>}
              </Reveal>
              <Reveal className="card" delay={240}>
                <span>If you left today</span>
                <strong>{exit === null ? '…' : exit === 'unavailable' ? usd(total, 2) : <CountUp value={exit.value} format={(x) => usd(x, 2)} />}</strong>
                <small>{exit === null ? 'asking the Binance Web3 API for a quote' : exit === 'unavailable'
                  ? `value now; a live quote was not available, and the sale may cost up to ${pct(v.stock.maxSlippage)} of the stock part`
                  : exit.cost > 0 ? `safe part back in full, ${name} sold at a live ${exit.vendor} quote (${usd(exit.cost, 2)} cost)` : 'all in the safe part, back in full'}</small>
              </Reveal>
            </div>

            <div className="manage">
              {!account && hasWallet() && <button className="pill dark" onClick={() => connect()}>Connect to manage</button>}
              {isSaver && normalOk !== false && [0.5, 1].map((f) => (
                <button key={f} className={`pill ${f === 1 ? 'red' : 'dark'}`} onClick={() => run(f === 1 ? 'Withdrawing everything…' : 'Withdrawing half…', () => withdraw(account!, address, f))}>
                  Withdraw {f === 1 ? 'all' : 'half'} at today's value
                </button>
              ))}
              {isSaver && normalOk === false && (
                <>
                  <span className="muted">A normal withdrawal would not go through right now (a pool or lending market is not trading). You can still leave with your holdings as they are:</span>
                  <button className="pill red" onClick={() => run('Withdrawing as is…', () => withdrawInKind(account!, address, 1, true))}>Withdraw as is: {name}, lending receipt and USDT</button>
                  <button className="pill dark" onClick={() => run('Withdrawing as is…', () => withdrawInKind(account!, address, 1, false))}>Withdraw as is, leaving {name} in the vault</button>
                </>
              )}
              {account && !isSaver && <span className="muted">Connected as {short(account)}. Only the saver {short(v.saver)} can withdraw.</span>}
              {wd && <span className="muted">{wd}</span>}
            </div>

            <dl className="sources" style={{ marginTop: 24 }}>
              <div><dt>In {sym ?? 'stock'}</dt><dd>{usd(stockUsd, 2)} (target {usd(n(s.target), 2)}, multiplier {n(s.multiplier)} of cap {n(s.cap)})</dd></div>
              <div><dt>Price</dt><dd>
                {usd(n(s.price), 2)}, the lower of {usd(n(s.slowPrice), 2)} (slow: {v.version === 2 ? "Venus's feed or the 10-minute pool average" : 'reference'}) and {usd(n(s.fastPrice), 2)} (fast: 60-second pool average)
                {ref && <>. Binance Web3 API: bStock {usd(ref.tokenPrice, 2)}, underlying stock {usd(ref.referencePrice, 2)}</>}
              </dd></div>
              <div><dt>Safe leg</dt><dd>{usd(n(s.safeUsd), 2)} in {MARKETS[Number(s.marketIndex)] ?? `market ${s.marketIndex}`}, {pct(n(s.floorRate), 2)} a year, {GATE_CODES[s.gateCode] ?? `gate code ${s.gateCode}`}
                {s.idleSince > 0n && <> · waiting in USDT since {when(Number(s.idleSince))}; the floor keeps the last healthy rate for 7 days</>}</dd></div>
              <div><dt>Saver</dt><dd><a href={`${BSCSCAN}/address/${v.saver}`}>{short(v.saver)}</a></dd></div>
              <div><dt>Keeper</dt><dd>{keeper ? <a href={`${BSCSCAN}/address/${keeper}`}>{short(keeper)}</a> : 'none'} (cuts risk at once; raises it back one step per four hours{v.version === 2 && raiseAt > now ? `, next raise from ${when(raiseAt)}` : ''}; cannot withdraw)</dd></div>
              {v.version === 1 && <div><dt>Contract</dt><dd>Plinth v1. New vaults open on v2, which follows crashes within a minute.</dd></div>}
            </dl>
          </>
        );
      })()}

      <h2>Every action</h2>
      {log && (log.length === 0 ? <p className="muted">No actions yet.</p> : (
        <ol className="log">
          {log.map((r) => (
            <li key={r.tx + r.event + r.logIndex}>
              <span className={`ev ${r.event}`}>{r.event}</span> <span className="det">{r.detail}</span> <a href={`${BSCSCAN}/tx/${r.tx}`}>{short(r.tx)}</a> <span className="blk">{r.time ? when(r.time) : `block ${r.block}`}</span>
            </li>
          ))}
        </ol>
      ))}
      {logError && (
        <p className="fail">
          The action history could not be loaded ({logError}). Every action is still public on{' '}
          <a href={`${BSCSCAN}/address/${address}#events`}>BscScan</a>.
        </p>
      )}
      <Footer />
    </section>
  );
}
