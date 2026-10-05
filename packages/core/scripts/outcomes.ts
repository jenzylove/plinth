// What a saver would have got: every 12 month window of real daily prices, Plinth next to holding the stock outright.
// For each stock it keeps the stock's worst year, a typical year and its best year (ranked by the stock's own return),
// at floors of 90%, 95% and 100%. Same rules and costs as the calibration. Writes data/outcomes-<date>.json.
// Run: npx tsx scripts/outcomes.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_CONFIG, runWindow, type Bar } from '../src/calibrate.js';

const cal = JSON.parse(readFileSync(new URL('../../../data/calibration-2026-09-30.json', import.meta.url), 'utf8'));

async function bars(ticker: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=10y&interval=1d`;
  let r: Response | undefined;
  for (let a = 0; a < 4 && !r?.ok; a++) { try { r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); } catch { await new Promise((z) => setTimeout(z, 2000 * (a + 1))); } }
  if (!r) throw new Error(`${ticker}: no response`);
  if (!r.ok) throw new Error(`${ticker}: HTTP ${r.status}`);
  const res: any = (await r.json() as any).chart?.result?.[0];
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
const FLOORS = [0.9, 0.95, 1];
const out: Record<string, any> = {};
for (const s of cal.stocks) {
  if (s.error || !s.windows) continue;
  const b = await bars(s.ticker);
  const T = DEFAULT_CONFIG.termDays;
  const wins: { s: number; hold: number }[] = [];
  for (let i = 0; i + T < b.length; i += 5) wins.push({ s: i, hold: (1000 * b[i + T].close) / b[i].close });
  if (wins.length < 10) continue;
  wins.sort((a, c) => a.hold - c.hold);
  const pick = { worst: wins[0], typical: wins[Math.floor(wins.length / 2)], best: wins[wins.length - 1] };
  const row: any = { multiplier: s.multiplier, windows: wins.length };
  for (const [k, w] of Object.entries(pick)) {
    row[k] = {
      from: day(b[w.s].t), to: day(b[w.s + T].t), hold: Math.round(w.hold * 100) / 100,
      plinth: Object.fromEntries(FLOORS.map((f) => [String(Math.round(f * 100)), Math.round(runWindow(b, w.s, { ...DEFAULT_CONFIG, promiseFraction: f, multiplier: s.multiplier }) * 100) / 100])),
    };
  }
  out[s.sym] = row;
  console.log(s.sym.padEnd(6), 'worst', row.worst.hold.toFixed(0), '->', row.worst.plinth['100'], ' best', row.best.hold.toFixed(0), '->', row.best.plinth['100'], '/', row.best.plinth['90']);
}
const date = new Date().toISOString().slice(0, 10);
writeFileSync(new URL(`../../../data/outcomes-${date}.json`, import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  source: 'Yahoo Finance daily bars, range=10y, split-adjusted; windows start every 5 trading days',
  method: 'Same rules as the calibration: rebalance at the open when drift passes 10%, 0.3% cost per trade, safe part at a fixed 3.5% a year, overnight gaps hit before anyone can act. End value is gross. Multipliers were chosen on this same history (in sample).',
  stocks: out,
}, null, 1));
