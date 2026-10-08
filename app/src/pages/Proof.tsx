import { alwaysOn, calibration, closedHours, gaps, NAMES, replays, stocks, type ReplayResult } from '../data';
import { pct, usd, wad } from '../format';
import { Footer } from './Front';

export function Proof() {
  const cfg = calibration.config;
  const tested = calibration.stocks.filter((c) => stocks.some((s) => s.sym === c.sym) && c.windows > 0);
  const periods = tested.reduce((a, c) => a + c.windows, 0);
  const misses = tested.reduce((a, c) => a + c.breaches, 0);
  const r18 = replays.results[0];
  const p18 = r18.plinthTotal.map(wad), b18 = r18.bankTotal.map(wad), f18 = r18.floor.map(wad);
  const closestP = Math.min(...p18.map((x, k) => x - f18[k])), closestB = Math.min(...b18.map((x, k) => x - f18[k]));
  const u = replays.utilization as { utilization: (string | number)[]; vaultMarket: number[]; vaultTotal: (string | number)[]; maxUtilization: number | string };
  const moved = u.vaultMarket.findIndex((m) => m === 2);
  const v0 = wad(u.vaultTotal[0]), vEnd = wad(u.vaultTotal[u.vaultTotal.length - 1]);
  const falls = closedHours.worst.filter((x) => x.sym !== 'MSTR').slice(0, 10);
  const t = alwaysOn.totals;
  return (
    <section className="page proof">
      <h1>Proof</h1>
      <p className="lead-p">
        Four tests of the floor, all on real prices and the real contracts. Each one opens to the full data.
        Want to see it live instead? <a href="/demo">Open the real vault</a>.
      </p>

      <article className="finding">
        <p className="f-kicker">1 · Ten years of real prices</p>
        <h2>{periods.toLocaleString()} twelve month periods across {tested.length} stocks. The floor held in {misses === 0 ? 'every one' : `all but ${misses}`}.</h2>
        <p className="muted">
          We ran the vault's rules through every stock's daily prices since 2016, starting a new 12 months every week.
          Each stock's risk level was chosen on this same history, so this shows the rules on the past, not a forecast.
        </p>
        <div className="f-grid">
          {['NVDA', 'AAPL', 'TSLA', 'MSFT', 'META', 'SPY'].map((sym) => tested.find((c) => c.sym === sym)).filter((c): c is (typeof tested)[number] => !!c).map((c) => (
            <div className="f-cell" key={c.sym}>
              <span>{NAMES[c.sym] ?? c.sym}</span>
              <b>{usd(c.min, 2)} to {usd(c.max)}</b>
              <small>worst and best year, per $1,000</small>
            </div>
          ))}
        </div>
        <details className="howcalc">
          <summary>See all the data</summary>
          <p className="muted small">
            {calibration.source}. Floor 100%, safe part {pct(cfg.rate)} a year, {pct(cfg.cost)} cost per trade, rebalance
            when the stock part drifts {pct(cfg.band, 0)} from target. Rule: {calibration.rule}. A period counts as a miss
            only if it ends more than 50 cents per $1,000 below the floor. End values are gross (stock still held is valued
            at the close). Prices are daily; nothing inside the day is modelled. Stocks with under 2 years of history run
            at 3 by rule, not by test. Generated {calibration.generated.slice(0, 10)}.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Stock</th><th>Risk level</th><th>Periods</th><th>Worst</th><th>Typical</th><th>Best</th><th>Misses</th><th>Beat lending</th><th>Worst overnight gap</th></tr>
              </thead>
              <tbody>
                {calibration.stocks.filter((c) => stocks.some((s) => s.sym === c.sym)).map((c) => {
                  const g = gaps.stocks.find((x) => x.sym === c.sym);
                  return (
                    <tr key={c.sym}>
                      <td>{NAMES[c.sym] ?? c.sym}</td>
                      <td>{c.multiplier}</td>
                      <td>{c.windows}</td>
                      {c.windows > 0 ? (
                        <>
                          <td>{usd(c.min, 2)}</td>
                          <td>{usd(c.median)}</td>
                          <td>{usd(c.max)}</td>
                          <td>{c.breaches}</td>
                          <td>{pct(c.beatSafeOnly, 0)}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="muted">Under 2 years of history: runs at 3</td>
                      )}
                      <td>{g ? `${pct(g.worstGap)} on ${g.on}` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </article>

      <article className="finding">
        <p className="f-kicker">2 · Nvidia's worst earnings night, replayed</p>
        <h2>At the worst moment, Plinth stayed {usd(closestP, 2)} above its floor. A bank desk came within {usd(closestB, 2)}.</h2>
        <p className="muted">
          November 2018, Nvidia opened 19% down after earnings. We replayed those weeks through Plinth's real contracts on
          a copy of BNB Chain, next to a bank desk running the same method once a day. The difference is the agent cutting
          risk before the report.
        </p>
        <Replay r={r18} path={replays.paths.paths[0]} />
        <details className="howcalc">
          <summary>See all the data</summary>
          <p className="muted small">
            Replay, not live. The real Plinth contracts run on a fork of BSC mainnet (block {r18.forkBlock}) while
            Nvidia's real daily prices are played into Venus's price feed and the real Uniswap pool. The risk level at each
            step comes from the agent's own policy code, cut at once and raised back one step per four hours as the contract
            allows. Two bank desks rebalance once a day at the close: one at a fixed risk level of 5, and one that makes the
            same cuts as Plinth's agent at full size and at once. The second shows what the cut is worth on its own. Nobody
            can trade through an overnight gap. Code: contracts/test/ReplayLab.t.sol.
          </p>
          <ReplayNumbers r={r18} path={replays.paths.paths[0]} />
          {replays.results.slice(1).map((r, k) => (
            <div key={r.name}><Replay r={r} path={replays.paths.paths[k + 1]} /><ReplayNumbers r={r} path={replays.paths.paths[k + 1]} /></div>
          ))}
        </details>
      </article>

      <article className="finding">
        <p className="f-kicker">3 · When the lending market gets crowded</p>
        <h2>As Venus filled up, the vault moved its safe money to Aave by itself{v0 - vEnd < 0.005 ? ', and kept every dollar.' : `, and lost ${usd(v0 - vEnd, 2)}.`}</h2>
        <p className="muted">
          Replayed on a copy of BNB Chain: a borrower drains Venus until 95% of its USDT is lent out. The vault's limit is
          {' '}{pct(wad(u.maxUtilization), 0)}. {moved > 0 && <>At {pct(wad(u.utilization[moved]), 0)} lent out, the safe part moved to Aave.</>}
        </p>
        <Utilization />
      </article>

      <article className="finding">
        <p className="f-kicker">4 · While New York sleeps</p>
        <h2>Big falls happen at night. The vault can act on them, and ignores the false ones.</h2>
        <p className="muted">
          The ten deepest falls in three months of real bStock prices, all while the New York market was closed. Plinth can
          sell during those hours, while a bank cannot. Some were glitches that recovered within minutes; a vault that trusted every
          price broke its floor on {t.naiveStocksBelowFloor.length} stocks. Plinth's price rule broke it on none.
        </p>
        <div className="falls">
          {falls.map((x) => (
            <div className="fall" key={x.sym + x.from}>
              <span>{NAMES[x.sym] ?? x.sym}</span>
              <i style={{ width: `${Math.min(100, Math.abs(x.worstInside) * 300)}%` }} />
              <b>{pct(x.worstInside, 0)}</b>
            </div>
          ))}
        </div>
        <details className="howcalc">
          <summary>See all the data</summary>
          <ClosedHours />
          <AlwaysOn />
        </details>
      </article>

      <Footer />
    </section>
  );
}

function Replay({ r, path }: { r: ReplayResult; path: (typeof replays.paths.paths)[number] }) {
  const plinth = r.plinthTotal.map(wad), bank = r.bankTotal.map(wad), floor = r.floor.map(wad);
  const cutDesk = (r.bankCutTotal ?? r.bankTotal).map(wad);
  const marginP = Math.min(...plinth.map((x, k) => x - floor[k]));
  const marginB = Math.min(...bank.map((x, k) => x - floor[k]));
  const marginC = Math.min(...cutDesk.map((x, k) => x - floor[k]));
  const all = [...plinth, ...bank, ...cutDesk, ...floor];
  const lo = Math.min(...all) - 2, hi = Math.max(...all) + 2;
  const W = 640, H = 220, n = plinth.length;
  const x = (k: number) => (k / (n - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = (vs: number[]) => vs.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const cut = path.steps.findIndex((s: { keeperMultiplier: number }) => s.keeperMultiplier < 5.7);
  return (
    <figure className="replay-fig">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Replay ${path.name}`}>
        <path d={line(floor)} className="l-floor" />
        <path d={line(bank)} className="l-bank" />
        <path d={line(cutDesk)} className="l-cutdesk" />
        <path d={line(plinth)} className="l-plinth" />
        {cut > 0 && <line x1={x(cut)} x2={x(cut)} y1={0} y2={H} className="l-cut" />}
      </svg>
      <p className="legend"><span className="k-plinth">Plinth</span> <span className="k-bank">Bank desk</span> <span className="k-cutdesk">Desk with the same cuts</span> <span className="k-floor">Floor</span>{cut > 0 && <span className="k-cut">Agent cuts risk</span>}</p>
    </figure>
  );
}

function ReplayNumbers({ r, path }: { r: ReplayResult; path: (typeof replays.paths.paths)[number] }) {
  const plinth = r.plinthTotal.map(wad), bank = r.bankTotal.map(wad), floor = r.floor.map(wad);
  const cutDesk = (r.bankCutTotal ?? r.bankTotal).map(wad);
  const n = plinth.length;
  const m = (xs: number[]) => Math.min(...xs.map((x, k) => x - floor[k]));
  return (
    <p className="muted small">
      <strong>{path.note}</strong> ({path.from} to {path.to}). Closest to the floor: Plinth {usd(m(plinth), 2)} above, bank
      desk {usd(m(bank), 2)}, desk with the same cuts {usd(m(cutDesk), 2)}. End: Plinth {usd(plinth[n - 1], 2)}, bank desk{' '}
      {usd(bank[n - 1], 2)}, desk with cuts {usd(cutDesk[n - 1], 2)}, floor {usd(floor[n - 1], 2)}.
    </p>
  );
}

function Utilization() {
  const u = replays.utilization as { utilization: (string | number)[]; vaultMarket: number[]; vaultTotal: (string | number)[]; maxUtilization: number | string; collateralBnb: number };
  const names = ['cash', 'Venus', 'Aave'];
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Venus lent out</th><th>Safe money in</th><th>Vault value</th></tr></thead>
          <tbody>
            {u.utilization.map((x, k) => (
              <tr key={k}><td>{pct(wad(x), 1)}</td><td>{names[u.vaultMarket[k]]}</td><td>{usd(wad(u.vaultTotal[k]), 2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClosedHours() {
  const top = closedHours.worst.filter((x) => x.sym !== 'MSTR').slice(0, 10);
  const held = top.filter((x) => x.atOpen <= x.worstInside * 0.6).length;
  return (
    <>
      <p>
        bStocks keep trading when NYSE is shut, and some falls happen there. {closedHours.source}. The ten deepest falls
        inside a closed stretch (nights and weekends), against the last regular hours price. In {held} of them the fall
        was still there at the next open, so a vault that can trade at night gets out first; in the rest the price came
        back by the open, and selling cost the vault a round trip. MSTR is left out: its history has an 8 minute print
        at -94%.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Stock</th><th>Shut from</th><th>Lowest while shut</th><th>At</th><th>At the next open</th></tr></thead>
          <tbody>
            {top.map((x) => (
              <tr key={x.sym + x.from}>
                <td>{NAMES[x.sym] ?? x.sym}</td><td>{x.from.slice(0, 16).replace('T', ' ')}</td>
                <td>{pct(x.worstInside)}</td><td>{x.lowAt.slice(0, 16).replace('T', ' ')}</td><td>{pct(x.atOpen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Rule: {closedHours.rule} Generated {closedHours.generated.slice(0, 10)}.</p>
    </>
  );
}

function AlwaysOn() {
  const t = alwaysOn.totals;
  const rows = alwaysOn.stocks.filter((r) => !r.excluded);
  return (
    <>
      <h3>Does trading around the clock help?</h3>
      <p>
        The same $1,000 vault (100% floor, each stock's cap) over each listed bStock's real hourly history, three ways.
        <b> Plinth</b> may rebalance at any hour and prices the stock its own way (the lower of a slow and a fast pool
        average). <b>A desk</b> uses the same price but may trade only in NYSE hours. <b>A naive vault</b> trades around
        the clock at the last price, with no price rule.
      </p>
      <p>
        Plinth against the desk, over {t.stocks} stocks: average end value {t.meanEndDiff >= 0 ? '+' : ''}{usd(t.meanEndDiff, 2)}, closest
        approach to the floor {t.meanMinMarginDiff >= 0 ? '+' : ''}{usd(t.meanMinMarginDiff, 2)}. In calm months, trading at night costs about
        nothing. The naive vault broke the floor on {t.naiveStocksBelowFloor.map((x) => NAMES[x] ?? x).join(' and ')} (worst end {usd(t.naiveWorstEnd, 2)}), bought
        into bad prints such as SPY at $1,086 against $750. Plinth's price rule broke it on none.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Stock</th><th>Multiplier</th><th>Plinth: closest / end</th><th>Desk: closest / end</th><th>Naive: closest / end</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sym}>
                <td>{NAMES[r.sym] ?? r.sym}</td><td>{r.cap}</td>
                <td>{usd(r.alwaysOn.minMargin, 2)} / {usd(r.alwaysOn.end, 2)}</td>
                <td>{usd(r.desk.minMargin, 2)} / {usd(r.desk.end, 2)}</td>
                <td className={r.naiveAlwaysOn.minMargin < 0 && r.alwaysOn.minMargin >= 0 ? 'fail' : ''}>{usd(r.naiveAlwaysOn.minMargin, 2)} / {usd(r.naiveAlwaysOn.end, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        "Closest" is the lowest margin over the floor at any hour's low, before anyone can act. QQQ's one minute print at
        -31% (2026-09-09) touches the floor for all three for one hour. Hourly bars stand in for the vault's prices, and the
        study's rule (the lower of this hour's and last hour's close) is a stand in for the contract's (slow reference, 60 second
        average confirmed by the live price), so this shows direction and size, not exact dollars. MSTR is left out of the
        totals because of its broken 8 minute print, although MSTR vaults can still be opened. The fork test
        test_M5_shortDownsidePrints measures the contract's own rule on 5 to 120 second holes. {alwaysOn.rule} Code:{' '}
        packages/core/scripts/always-on.ts, data from the Binance Web3 API.
      </p>
    </>
  );
}
