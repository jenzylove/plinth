import { calibration, gaps, NAMES, replays, stocks, type ReplayResult } from '../data';
import { pct, usd, wad } from '../format';
import { Footer } from './Front';

export function Proof() {
  const cfg = calibration.config;
  return (
    <section className="page proof">
      <h1>Proof</h1>
      <p>
        Three kinds of evidence: a 10-year backtest of every listed stock, replays of real crashes run against the real
        contracts on a copy of BSC mainnet, and a live vault on mainnet (<a href="/demo">open it</a>).
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
        comes from the keeper's own policy code. Next to it, a bank desk running the same method at multiplier 5,
        rebalancing once a day at the close. Nobody can trade through an overnight gap. Code:{' '}
        <code>contracts/test/ReplayLab.t.sol</code>.
      </p>
      {replays.results.map((r, i) => <Replay key={r.name} r={r} path={replays.paths.paths[i]} />)}

      <h3>When the lending market gets crowded</h3>
      <Utilization />
      <Footer />
    </section>
  );
}

function Replay({ r, path }: { r: ReplayResult; path: (typeof replays.paths.paths)[number] }) {
  const plinth = r.plinthTotal.map(wad), bank = r.bankTotal.map(wad), floor = r.floor.map(wad);
  const marginP = Math.min(...plinth.map((x, k) => x - floor[k]));
  const marginB = Math.min(...bank.map((x, k) => x - floor[k]));
  const all = [...plinth, ...bank, ...floor];
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
        desk {usd(marginB, 2)} above. End: Plinth {usd(plinth[n - 1], 2)}, bank desk {usd(bank[n - 1], 2)}, floor {usd(floor[n - 1], 2)}.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Replay ${path.name}`}>
        <path d={line(floor)} className="l-floor" />
        <path d={line(bank)} className="l-bank" />
        <path d={line(plinth)} className="l-plinth" />
        {cut > 0 && <line x1={x(cut)} x2={x(cut)} y1={0} y2={H} className="l-cut" />}
      </svg>
      <p className="legend"><span className="k-plinth">Plinth</span> <span className="k-bank">Bank desk</span> <span className="k-floor">Floor</span>{cut > 0 && <span className="k-cut">Keeper cuts risk: {path.steps[cut].reason}</span>}</p>
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
