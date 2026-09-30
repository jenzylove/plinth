// Worst overnight gap (open vs previous close) per stock over 10 years of Yahoo daily prices.
// The keeper caps the multiplier at 1 / (1.25 x worst gap) around that stock's earnings.
// Writes data/gaps-<date>.json. Run: npx tsx scripts/worst-gaps.ts
import { writeFileSync, readFileSync } from 'node:fs';

const stocks = JSON.parse(readFileSync(new URL('../../../data/stocks.json', import.meta.url), 'utf8')).stocks;
const cal = JSON.parse(readFileSync(new URL('../../../data/calibration-2026-09-30.json', import.meta.url), 'utf8')).stocks;
const date = new Date().toISOString().slice(0, 10);
const out: any[] = [];
for (const s of stocks) {
  const ticker = cal.find((c: any) => c.sym === s.sym).ticker;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const res = (await r.json() as any).chart.result[0];
  const q = res.indicators.quote[0];
  let worst = 0, when = 0;
  for (let i = 1; i < res.timestamp.length; i++) {
    if (!(q.open[i] > 0 && q.close[i - 1] > 0)) continue;
    // Use the adjusted ratio so splits do not look like gaps.
    const a = res.indicators.adjclose[0].adjclose;
    const f0 = a[i - 1] / q.close[i - 1], f1 = a[i] / q.close[i];
    const g = (q.open[i] * f1) / (q.close[i - 1] * f0) - 1;
    if (g < worst) { worst = g; when = res.timestamp[i]; }
  }
  const eventCap = Math.floor(Math.min(6, 1 / (1.25 * -worst)) * 10) / 10;
  out.push({ sym: s.sym, ticker, worstGap: +worst.toFixed(4), on: new Date(when * 1000).toISOString().slice(0, 10), eventCap });
  console.log(s.sym.padEnd(6), (worst * 100).toFixed(1).padStart(6) + '%', new Date(when * 1000).toISOString().slice(0, 10), 'eventCap', eventCap);
}
writeFileSync(new URL(`../../../data/gaps-${date}.json`, import.meta.url), JSON.stringify({ generated: new Date().toISOString(), source: 'Yahoo Finance daily bars, range=10y, split-adjusted', rule: 'eventCap = min(6, 1 / (1.25 x worst overnight gap)), floored to 0.1', stocks: out }, null, 1));
