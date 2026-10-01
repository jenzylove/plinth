// Real NVDA price paths for the replay lab, from Yahoo daily bars (split-adjusted).
// Each trading day becomes two steps: the open (an overnight gap, nobody can trade through it) and the
// close (the vault and the bank desk may rebalance). Prices are relative to the first close.
// Windows: Nvidia's 2018-11-16 earnings gap, and the worst 5-day drop of July 2026 (picked by rule).
// Writes data/replay-paths.json. Run: npx tsx scripts/replay-paths.ts
import { writeFileSync } from 'node:fs';
import { decide, type RiskEvent } from '../../keeper/src/policy.ts';

// Events inside the windows, with sources. The keeper's real policy turns them into a multiplier per step.
const EVENTS: (RiskEvent & { source: string })[] = [
  { kind: 'earnings', symbol: 'NVDA', name: 'Nvidia Q3 FY2019 earnings', at: Date.parse('2018-11-15T21:20:00Z') / 1000,
    source: 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-third-quarter-fiscal-2019' },
  { kind: 'fomc', name: 'FOMC rate decision', at: Date.parse('2026-07-29T18:00:00Z') / 1000,
    source: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
];
const NVDA = { symbol: 'NVDA', cap: 5.7, eventCap: 4.1 }; // data/calibration-2026-09-30.json, data/gaps-2026-09-30.json

/** NYSE open and close in UTC: ET is UTC-4 in US daylight time, UTC-5 otherwise. */
function sessionUtc(date: string, kind: 'open' | 'close'): number {
  const noonUtc = Date.parse(date + 'T12:00:00Z');
  const ny = new Date(noonUtc).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const offset = 12 - Number(ny); // 4 in daylight time, 5 otherwise
  return Date.parse(date + 'T00:00:00Z') / 1000 + (kind === 'open' ? 9.5 + offset : 16 + offset) * 3600;
}

interface Bar { date: string; open: number; close: number }

async function bars(ticker: string, from: string, to: string): Promise<Bar[]> {
  const p1 = Date.parse(from) / 1000, p2 = Date.parse(to) / 1000 + 86400;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const res = (await r.json() as any).chart.result[0];
  const q = res.indicators.quote[0], adj = res.indicators.adjclose[0].adjclose;
  const out: Bar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    if (!(q.open[i] > 0 && q.close[i] > 0)) return;
    const f = adj[i] / q.close[i]; // the same factor applies to the open
    out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), open: q.open[i] * f, close: q.close[i] * f });
  });
  return out;
}

function path(name: string, note: string, b: Bar[]) {
  const base = b[0].close;
  const raw: { date: string; kind: 'open' | 'close'; price: number }[] = [{ date: b[0].date, kind: 'close', price: 1 }];
  for (const d of b.slice(1)) {
    raw.push({ date: d.date, kind: 'open', price: +(d.open / base).toFixed(6) });
    raw.push({ date: d.date, kind: 'close', price: +(d.close / base).toFixed(6) });
  }
  // The keeper acts before each step: the multiplier it would hold at that moment.
  const steps = raw.map((s) => {
    const at = sessionUtc(s.date, s.kind);
    const d = decide(NVDA, EVENTS, at);
    return { ...s, at, keeperMultiplier: d.multiplier, reason: d.reason };
  });
  // The same steps as integer arrays for the Solidity replay (WAD = 1e18).
  const wad = (x: number) => (BigInt(Math.round(x * 1e6)) * 10n ** 12n).toString();
  const series = {
    at: steps.map((s) => s.at),
    priceWad: steps.map((s) => wad(s.price)),
    multiplierWad: steps.map((s) => wad(s.keeperMultiplier)),
    isClose: steps.map((s) => (s.kind === 'close' ? 1 : 0)),
  };
  return { name, note, ticker: 'NVDA', from: b[0].date, to: b[b.length - 1].date, steps, series };
}

/** The 5 trading days with the lowest close-to-close return, ending inside the month. */
function worstWeek(b: Bar[], month: string): Bar[] {
  let best = 0, at = -1;
  for (let i = 5; i < b.length; i++) {
    if (!b[i].date.startsWith(month)) continue;
    const r = b[i].close / b[i - 5].close - 1;
    if (r < best) { best = r; at = i; }
  }
  return b.slice(at - 5, at + 1);
}

const nov = await bars('NVDA', '2018-11-08', '2018-11-30');
const jul = await bars('NVDA', '2026-06-24', '2026-07-31');
const week = worstWeek(jul, '2026-07');

const out = {
  generated: new Date().toISOString(),
  source: 'Yahoo Finance daily bars (open, close), split-adjusted',
  stock: NVDA,
  bankDesk: { multiplier: 5, rebalance: 'once a day at the close, no event cuts' },
  events: EVENTS,
  paths: [
    path('nvda-2018-11', "Nvidia's -19.3% earnings gap (2018-11-16) and the days around it", nov),
    path('nvda-2026-07', 'The worst 5-day stretch of July 2026, picked by rule (lowest close-to-close return)', week),
  ],
};
writeFileSync(new URL('../../../data/replay-paths.json', import.meta.url), JSON.stringify(out, null, 1));
for (const p of out.paths) {
  const lo = Math.min(...p.steps.map((s) => s.price));
  console.log(p.name, p.from, '->', p.to, 'steps', p.steps.length, 'low', ((lo - 1) * 100).toFixed(1) + '%');
}
