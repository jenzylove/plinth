// Every possible 12 month period, not a sample: one starting on every trading day of each stock's 10 years of real
// daily prices (Yahoo Finance), at the multiplier the factory actually uses. Lists every period that ended below the
// floor, and the same periods for a fixed stock and USDT split that is bought once and held.
// Writes data/backtest-every-day-<date>.json. Run: npx tsx scripts/backtest-every-day.ts
//
// Why this exists: the calibration (calibrate-all.ts) started a period every 5 trading days. Its "zero misses" was true
// of that sample only. This is the full count.
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_CONFIG, runWindow, type Bar } from '../src/calibrate.js';
import { startingExposure, YEAR_SECONDS } from '../src/cppi.js';

const cal = JSON.parse(readFileSync(new URL('../../../data/calibration-2026-09-30.json', import.meta.url), 'utf8'));

async function bars(ticker: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=1d`;
  let r: Response | undefined;
  for (let a = 0; a < 8 && !r?.ok; a++) {
    try { r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) }); }
    catch { await new Promise((z) => setTimeout(z, 3000 * (a + 1))); }
  }
  if (!r?.ok) throw new Error(`${ticker}: no data`);
  const res: any = ((await r.json()) as any).chart?.result?.[0];
  const q = res.indicators.quote[0];
  const out: Bar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    const adj = res.indicators.adjclose?.[0]?.adjclose?.[i];
    const f = adj && q.close[i] ? adj / q.close[i] : 1;
    if (q.open[i] > 0 && q.close[i] > 0) out.push({ t, open: q.open[i] * f, close: q.close[i] * f });
  });
  return out;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const { termDays: T, rate, cost } = DEFAULT_CONFIG;
const MISS_BELOW = 999.5; // the calibration's own tolerance: 50 cents per $1,000

const stocks: any[] = [];
const total = { periods: 0, misses: 0, worst: Infinity, splitBelow: 0, plinthAhead: 0, plinthSum: 0, splitSum: 0 };
for (const s of cal.stocks) {
  if (s.error || !s.windows) continue;
  const b = await bars(s.ticker);
  const cfg = { ...DEFAULT_CONFIG, multiplier: s.multiplier };
  const share = startingExposure(1000, 1, rate, s.multiplier, YEAR_SECONDS) / 1000;
  const ends: number[] = [], split: number[] = [], misses: any[] = [];
  for (let i = 0; i + T < b.length; i++) {
    const v = runWindow(b, i, cfg);
    ends.push(v);
    // Same starting share, same buying cost, no rebalancing; the rest at the same fixed lending rate.
    split.push(1000 * share * (1 - cost) * (b[i + T].close / b[i].close) + 1000 * (1 - share) * (1 + rate));
    if (v < MISS_BELOW) misses.push({ from: day(b[i].t), to: day(b[i + T].t), end: r2(v) });
  }
  const sorted = [...ends].sort((a, c) => a - c), ss = [...split].sort((a, c) => a - c);
  const ahead = ends.filter((v, k) => v > split[k]).length;
  stocks.push({
    sym: s.sym, multiplier: s.multiplier, from: day(b[0].t), periods: ends.length,
    min: r2(sorted[0]), median: r2(sorted[sorted.length >> 1]), max: r2(sorted[sorted.length - 1]),
    misses,
    split: { share: Math.round(share * 1000) / 1000, min: r2(ss[0]), median: r2(ss[ss.length >> 1]), max: r2(ss[ss.length - 1]), below: split.filter((v) => v < MISS_BELOW).length, plinthAhead: ahead },
  });
  total.periods += ends.length; total.misses += misses.length; total.worst = Math.min(total.worst, sorted[0]);
  total.splitBelow += split.filter((v) => v < MISS_BELOW).length; total.plinthAhead += ahead;
  total.plinthSum += ends.reduce((a, c) => a + c, 0); total.splitSum += split.reduce((a, c) => a + c, 0);
  console.log(s.sym.padEnd(6), String(ends.length).padStart(5), 'periods', String(misses.length).padStart(2), 'misses, worst', sorted[0].toFixed(2), '| fixed split below:', split.filter((v) => v < MISS_BELOW).length);
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(new URL(`../../../data/backtest-every-day-${date}.json`, import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'Yahoo Finance daily bars, range=10y, split-adjusted',
  method: `One 12 month period starting on every trading day. Multipliers as deployed in the factory (from data/calibration-2026-09-30.json). Rebalance at the open when the stock part drifts ${(DEFAULT_CONFIG.band * 100).toFixed(0)}% from target, ${(cost * 100).toFixed(1)}% cost per trade, safe part at a fixed ${(rate * 100).toFixed(1)}% a year, overnight gaps hit before anyone can act. A miss is a period ending below $${MISS_BELOW.toFixed(2)} per $1,000. End values are gross. No event cuts by the agent are modelled. The fixed split buys the same starting share of stock once and holds it, with the rest at the same rate.`,
  totals: {
    stocks: stocks.length, periods: total.periods, misses: total.misses, held: 1 - total.misses / total.periods, worst: r2(total.worst),
    split: { below: total.splitBelow, belowShare: total.splitBelow / total.periods, plinthAheadShare: total.plinthAhead / total.periods, plinthMean: r2(total.plinthSum / total.periods), splitMean: r2(total.splitSum / total.periods) },
  },
  stocks,
}, null, 1));
console.log(`TOTAL ${total.periods} periods, ${total.misses} misses, floor held in ${((1 - total.misses / total.periods) * 100).toFixed(2)}%`);
