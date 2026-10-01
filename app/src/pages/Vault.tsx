import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { BSCSCAN, GATE_CODES, currentKeeper, vaultStatus } from '../chain';
import { NAMES, stocks } from '../data';
import { pct, short, usd } from '../format';
import { CountUp, Reveal } from '../motion';
import { connect, hasWallet, withdraw } from '../wallet';
import { Footer } from './Front';

type Status = Awaited<ReturnType<typeof vaultStatus>>;
const MARKETS = ['Plain USDT (earning nothing)', 'Venus', 'Aave'];
const HISTORY_API = 'https://plinth-relay.vercel.app/api/vault-log';

interface LogRow { event: string; block: number; tx: string; time?: number; detail: string }

export function VaultPage({ address, demo }: { address: Address; demo?: boolean }) {
  const [v, setV] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [me, setMe] = useState<Address | null>(null);
  const [wd, setWd] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [keeper, setKeeper] = useState<string | null>(null);
  useEffect(() => { currentKeeper().then(setKeeper).catch(() => setKeeper(null)); }, []);

  useEffect(() => {
    const load = () => vaultStatus(address).then((x) => { setV(x); setReadAt(new Date()); }).catch((e) => setError(String(e?.shortMessage ?? e?.message ?? e)));
    load();
    const t = setInterval(load, 30_000);
    fetch(`${HISTORY_API}?vault=${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history service answered ${r.status}`))))
      .then((d) => setLog(d.rows))
      .catch((e) => setLogError(String(e.message ?? e)));
    return () => clearInterval(t);
  }, [address, tick]);

  const n = (x: bigint) => Number(x) / 1e18;
  const sym = v ? stocks[v.stockId]?.sym : undefined;

  return (
    <section className="page vault">
      {demo && (
        <p className="banner">
          Live: a real vault on BSC mainnet. Everything here is read from the chain every 30 seconds.
        </p>
      )}
      <h1>{sym ? `${NAMES[sym] ?? sym} vault` : 'Vault'} <a className="addr" href={`${BSCSCAN}/address/${address}`}>{short(address)}</a></h1>
      {error && <p className="fail">Could not read this vault: {error}</p>}
      {!v && !error && <p className="muted">Reading the vault from BSC…</p>}
      {v && (() => {
        const s = v.s;
        const total = n(s.total), floor = n(s.floor), stockUsd = n(s.stockUsd);
        const bd = s.breakDistance > 10n ** 30n ? null : n(s.breakDistance);
        return (
          <>
            <div className="dash">
              <Reveal className="card black"><span>Value now</span><strong><CountUp value={total} format={(x) => usd(x, 2)} /></strong><small>in USDT, read {readAt?.toISOString().slice(11, 19)} UTC</small></Reveal>
              <Reveal className="card" delay={80}><span>Floor today</span><strong><CountUp value={floor} format={(x) => usd(x, 2)} /></strong><small>grows to {usd(n(s.promised), 2)} by {new Date(Number(s.maturity) * 1000).toISOString().slice(0, 10)}</small></Reveal>
              <Reveal className="card" delay={160}>
                <span>Break distance</span>
                <strong>{bd === null ? 'no stock' : <CountUp value={bd * 100} format={(x) => x.toFixed(1) + '%'} />}</strong>
                <small>the single drop in {sym ?? 'the stock'} that would touch the floor today</small>
                {bd !== null && <div className="meter"><i style={{ width: `${Math.min(100, bd * 100 * 2.5)}%` }} /></div>}
              </Reveal>
              <Reveal className="card" delay={240}><span>Worst exit today</span><strong><CountUp value={floor} format={(x) => usd(x, 2)} /></strong><small>the floor's value now</small></Reveal>
            </div>
            <div className="manage">
              {!me && hasWallet() && <button className="pill dark" onClick={() => connect().then(setMe).catch((e) => setWd(String(e?.shortMessage ?? e?.message)))}>Connect to manage</button>}
              {me && me.toLowerCase() === v.saver.toLowerCase() && [0.5, 1].map((f) => (
                <button key={f} className={`pill ${f === 1 ? 'red' : 'dark'}`} onClick={async () => {
                  setWd(f === 1 ? 'Withdrawing everything…' : 'Withdrawing half…');
                  try { const h = await withdraw(me, address, f); setWd(`Done. USDT sent to your wallet: ${BSCSCAN}/tx/${h}`); setTick((t) => t + 1); }
                  catch (e) { setWd(String((e as { shortMessage?: string })?.shortMessage ?? (e as Error).message).split('\n')[0]); }
                }}>Withdraw {f === 1 ? 'all' : 'half'} at today's value</button>
              ))}
              {me && me.toLowerCase() !== v.saver.toLowerCase() && <span className="muted">Connected as {short(me)}. Only the saver {short(v.saver)} can withdraw.</span>}
              {wd && <span className="muted">{wd}</span>}
            </div>
            <dl className="sources" style={{ marginTop: 24 }}>
              <div><dt>In {sym ?? 'stock'}</dt><dd>{usd(stockUsd, 2)} (target {usd(n(s.target), 2)}, multiplier {n(s.multiplier)} of cap {n(s.cap)})</dd></div>
              <div><dt>Safe leg</dt><dd>{usd(n(s.safeUsd), 2)} in {MARKETS[Number(s.marketIndex)] ?? `market ${s.marketIndex}`}, {pct(n(s.floorRate), 2)} a year, {GATE_CODES[s.gateCode] ?? `gate code ${s.gateCode}`}</dd></div>
              <div><dt>Saver</dt><dd><a href={`${BSCSCAN}/address/${v.saver}`}>{short(v.saver)}</a></dd></div>
              <div><dt>Keeper</dt><dd>{keeper ? <a href={`${BSCSCAN}/address/${keeper}`}>{short(keeper)}</a> : 'reading…'} (can rebalance and lower risk, cannot withdraw)</dd></div>
              <div><dt>Read</dt><dd>{readAt?.toISOString().slice(11, 19)} UTC</dd></div>
            </dl>
          </>
        );
      })()}

      <h2>Every action</h2>
      {log && (log.length === 0 ? <p className="muted">No actions yet.</p> : (
        <ol className="log">
          {log.map((r) => (
            <li key={r.tx + r.event + (r as LogRow & { logIndex?: number }).logIndex}>
              <span className={`ev ${r.event}`}>{r.event}</span> <span className="det">{r.detail}</span> <a href={`${BSCSCAN}/tx/${r.tx}`}>{short(r.tx)}</a> <span className="blk">block {r.block}</span>
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
