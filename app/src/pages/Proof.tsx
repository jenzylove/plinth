import { alwaysOn, calibration, closedHours, gaps, NAMES, replays, stocks, type ReplayResult } from '../data';
import { pct, usd, wad } from '../format';
import { Footer } from './Front';

export function Proof() {
  const cfg = calibration.config;
  return (
    <section className="page proof">
      <h1>Proof</h1>
      <p>
        Four kinds of evidence: a 10-year backtest of every listed stock, replays of real crashes run against the real
        contracts on a copy of BSC mainnet, three months of real bStock prices from while New York was shut, and a live
        vault on mainnet (<a href="/demo">open it</a>).
      </p>

      <h2>10 years, every 12-month window</h2>
      <p className="muted">
        {calibration.source}. Floor 100%, safe leg {pct(cfg.rate)} a year, {pct(cfg.cost)} cost per trade, rebalance
        when the stock leg drifts {pct(cfg.band, 0)} from target. A window counts as a miss if it ends more than 50 cents per
        $1,000 below the floor. Rule: {calibration.rule}. Generated {calibration.generated.slice(0, 10)}.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Stock</th><th>Multiplier</th><th>Windows</th><th>Lowest</th><th>Typical</th><th>Best</th><th>Misses</th><th>Beat lending</th><th>Worst overnight gap</th></tr>
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
                    <td colSpan={5} className="muted">Under 2 years of history: no full 12-month window yet, so it runs at 3</td>
                  )}
                  <td>{g ? `${pct(g.worstGap)} on ${g.on}` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Replay lab</h2>
      <p className="banner replay">
        Replay, not live. The real Plinth contracts run on a fork of BSC mainnet (block {replays.results[0].forkBlock}) while
        Nvidia's real daily prices are played into Venus's price feed and the real Uniswap pool. The multiplier at each step
        comes from the keeper's own policy code, cut at once and raised back one step per four hours as the contract
        allows. Next to it, two bank desks rebalancing once a day at the close: one at a fixed multiplier 5, and one that
        makes the same cuts as Plinth's keeper, at full size and at once (the better deal). The second desk shows what the
        cut is worth on its own. Nobody can trade through an overnight gap. Code:{' '}
        <code>contracts/test/ReplayLab.t.sol</code>.
      </p>
      {replays.results.map((r, i) => <Replay key={r.name} r={r} path={replays.paths.paths[i]} />)}

      <h3>When the lending market gets crowded</h3>
      <Utilization />

      <h2>While New York sleeps</h2>
      <ClosedHours />
      <AlwaysOn />
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
      <figcaption>
        <strong>{path.note}</strong> ({path.from} to {path.to}). Closest to the floor: Plinth {usd(marginP, 2)} above, bank
        desk {usd(marginB, 2)}, desk with the same cuts {usd(marginC, 2)}. End: Plinth {usd(plinth[n - 1], 2)}, bank desk{' '}
        {usd(bank[n - 1], 2)}, desk with cuts {usd(cutDesk[n - 1], 2)}, floor {usd(floor[n - 1], 2)}.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Replay ${path.name}`}>
        <path d={line(floor)} className="l-floor" />
        <path d={line(bank)} className="l-bank" />
        <path d={line(cutDesk)} className="l-cutdesk" />
        <path d={line(plinth)} className="l-plinth" />
        {cut > 0 && <line x1={x(cut)} x2={x(cut)} y1={0} y2={H} className="l-cut" />}
      </svg>
      <p className="legend"><span className="k-plinth">Plinth</span> <span className="k-bank">Bank desk</span> <span className="k-cutdesk">Desk with the same cuts</span> <span className="k-floor">Floor</span>{cut > 0 && <span className="k-cut">Keeper cuts risk: {path.steps[cut].reason}</span>}</p>
    </figure>
  );
}

function Utilization() {
  const u = replays.utilization as { utilization: (string | number)[]; vaultMarket: number[]; vaultTotal: (string | number)[]; maxUtilization: number | string; collateralBnb: number };
  const names = ['plain USDT', 'Venus', 'Aave'];
  return (
    <>
      <p>
        Replay: a borrower posts {u.collateralBnb.toLocaleString()} BNB and borrows real USDT from Venus until it is
        95% lent out. The vault's line is {pct(wad(u.maxUtilization), 0)}. Past it, anyone can pull the vault out.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Venus lent out</th><th>Vault's safe leg in</th><th>Vault value</th></tr></thead>
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
        inside a closed stretch (nights and weekends), against the last regular-hours price. In {held} of them the fall
        was still there at the next open, so a vault that can trade at night gets out first; in the rest the price came
        back by the open, and selling cost the vault a round trip. MSTR is left out: its history has an 8-minute print
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
        "Closest" is the lowest margin over the floor at any hour's low, before anyone can act. QQQ's one-minute print at
        -31% (2026-09-09) touches the floor for all three for one hour. Hourly bars stand in for the vault's 60-second and
        10-minute prices, so this shows direction and size, not exact dollars. {alwaysOn.rule} Code:{' '}
        <code>packages/core/scripts/always-on.ts</code>, data from the Binance Web3 API.
      </p>
    </>
  );
}
