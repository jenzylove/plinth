// Calibrate the multiplier cap for every liquid bStock from 10 years of real daily prices (Yahoo Finance).
// Writes data/calibration-<date>.json. Run: npx tsx scripts/calibrate-all.ts
import { writeFileSync } from 'node:fs';
import { backtest, calibrateMultiplier, DEFAULT_CONFIG, type Bar } from '../src/calibrate.js';

// bStock symbol -> Yahoo ticker of the underlying.
const UNDERLYING: Record<string, string> = {
  AAPL: 'AAPL', AMZN: 'AMZN', BABA: 'BABA', CRCL: 'CRCL', GME: 'GME', GOOGL: 'GOOGL', HOOD: 'HOOD',
  INTC: 'INTC', META: 'META', MRVL: 'MRVL', MSFT: 'MSFT', MSTR: 'MSTR', NFLX: 'NFLX', NVDA: 'NVDA',
  QQQ: 'QQQ', SKHY: '000660.KS', SNDK: 'SNDK', SPCX: 'SPCX', SPY: 'SPY', TSLA: 'TSLA', TSM: 'TSM',
};

async function bars(ticker: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${ticker}: HTTP ${r.status}`);
  const j: any = await r.json();
  const res = j.chart?.result?.[0];
  if (!res) throw new Error(`${ticker}: ${JSON.stringify(j.chart?.error)}`);
  const q = res.indicators.quote[0];
  const out: Bar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    // Split-adjust opens with the same factor Yahoo applies to closes.
    const adj = res.indicators.adjclose?.[0]?.adjclose?.[i];
    const f = adj && q.close[i] ? adj / q.close[i] : 1;
    if (q.open[i] > 0 && q.close[i] > 0) out.push({ t, open: q.open[i] * f, close: q.close[i] * f });
  });
  return out;
}

const date = new Date().toISOString().slice(0, 10);
const rows: any[] = [];
for (const [sym, ticker] of Object.entries(UNDERLYING)) {
  try {
    const b = await bars(ticker);
    const m = calibrateMultiplier(b);
    const r = backtest(b, { ...DEFAULT_CONFIG, multiplier: m });
    rows.push({ sym, ticker, days: b.length, from: new Date(b[0].t * 1000).toISOString().slice(0, 10), multiplier: m, ...r });
    console.log(sym.padEnd(6), ticker.padEnd(10), String(b.length).padStart(5), 'days  m', m, ' min', r.min.toFixed(0), 'median', r.median.toFixed(0), 'max', r.max.toFixed(0), 'breaches', r.breaches);
  } catch (e) {
    rows.push({ sym, ticker, error: String(e) });
    console.log(sym, 'ERROR', String(e));
  }
}
writeFileSync(new URL(`../../../data/calibration-${date}.json`, import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'Yahoo Finance daily bars, range=10y, split-adjusted',
  rule: 'highest multiplier (step 0.1, cap 6) with zero 12-month windows ending below the floor; <2y history -> 3',
  config: DEFAULT_CONFIG,
  stocks: rows,
}, null, 1));
