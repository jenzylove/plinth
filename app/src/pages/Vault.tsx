import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { BSCSCAN, GATE_CODES, KEEPER, vaultStatus } from '../chain';
import { NAMES, stocks } from '../data';
import { pct, short, usd } from '../format';

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

  useEffect(() => {
    const load = () => vaultStatus(address).then((x) => { setV(x); setReadAt(new Date()); }).catch((e) => setError(String(e?.shortMessage ?? e?.message ?? e)));
    load();
    const t = setInterval(load, 30_000);
    fetch(`${HISTORY_API}?vault=${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history service answered ${r.status}`))))
      .then((d) => setLog(d.rows))
      .catch((e) => setLogError(String(e.message ?? e)));
    return () => clearInterval(t);
  }, [address]);

  const n = (x: bigint) => Number(x) / 1e18;
  const sym = v ? stocks[v.stockId]?.sym : undefined;

  return (
    <section className="vault">
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
            <div className="figures">
              <div><span>Value now</span><strong>{usd(total, 2)}</strong></div>
              <div><span>Floor today</span><strong>{usd(floor, 2)}</strong><small>grows to {usd(n(s.promised), 2)} by {new Date(Number(s.maturity) * 1000).toISOString().slice(0, 10)}</small></div>
              <div><span>Break distance</span><strong>{bd === null ? 'nothing in stock' : pct(bd)}</strong><small>the single drop in {sym ?? 'the stock'} that would touch the floor today</small></div>
              <div><span>Worst-case exit today</span><strong>{usd(floor, 2)}</strong><small>the floor's value now</small></div>
            </div>
            <dl className="sources">
              <div><dt>In {sym ?? 'stock'}</dt><dd>{usd(stockUsd, 2)} (target {usd(n(s.target), 2)}, multiplier {n(s.multiplier)} of cap {n(s.cap)})</dd></div>
              <div><dt>Safe leg</dt><dd>{usd(n(s.safeUsd), 2)} in {MARKETS[Number(s.marketIndex)] ?? `market ${s.marketIndex}`}, {pct(n(s.floorRate), 2)} a year, {GATE_CODES[s.gateCode] ?? `gate code ${s.gateCode}`}</dd></div>
              <div><dt>Saver</dt><dd><a href={`${BSCSCAN}/address/${v.saver}`}>{short(v.saver)}</a></dd></div>
              <div><dt>Keeper</dt><dd><a href={`${BSCSCAN}/address/${KEEPER}`}>{short(KEEPER)}</a> (can rebalance and lower risk, cannot withdraw)</dd></div>
              <div><dt>Read</dt><dd>{readAt?.toISOString().slice(11, 19)} UTC</dd></div>
            </dl>
          </>
        );
      })()}

      <h2>Every action</h2>
      {log && (log.length === 0 ? <p className="muted">No actions yet.</p> : (
        <ol className="log">
          {log.map((r) => (
            <li key={r.tx + r.event}>
              <span>{r.event}</span> {r.detail} <a href={`${BSCSCAN}/tx/${r.tx}`}>{short(r.tx)}</a>
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
    </section>
  );
}
