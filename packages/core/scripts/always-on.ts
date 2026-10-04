// Does trading around the clock help a capital-protected vault, or hurt it? Runs the same CPPI vault over each
// listed bStock's real hourly history (data/bstock-hourly-*.json, from the Binance Web3 API) two ways:
//   always-on: may rebalance at every hourly close (Plinth's keeper)
//   desk:      may rebalance only at hourly closes inside the NYSE session (a bank desk)
// Same floor (100%), same multiplier (the stock's cap), same band, same cost per trade, and the vault's own price
// rule at hourly scale: it values the stock at the lower of this hour's and last hour's close (falls count at
// once, rises must last), and a buy is skipped when the pool is more than the slippage limit above that value.
// The first 24 hours of each listing are skipped (opening prints such as META's $5,228 first bar).
// Hourly bars are a coarse stand-in for the vault's 60-second and 10-minute prices: direction and size, not
// exact dollars.
// Writes data/always-on-<date>.json. Run: npx tsx scripts/always-on.ts [bstock-hourly file]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { floorValue, rebalance, YEAR_SECONDS, type VaultState } from '../src/cppi.js';

const dataDir = new URL('../../../data/', import.meta.url);
const file = process.argv[2] ?? readdirSync(dataDir).filter((f) => f.startsWith('bstock-hourly-')).sort().at(-1)!;
const hourly = JSON.parse(readFileSync(new URL(file, dataDir), 'utf8'));
const stocks: { sym: string; cap: number }[] = JSON.parse(readFileSync(new URL('stocks.json', dataDir), 'utf8')).stocks;
const date = new Date().toISOString().slice(0, 10);

const RATE = 0.035, COST = 0.003, BAND = 0.1, DEPOSIT = 1000, SLIPPAGE = 0.015, SKIP_HOURS = 24;
// MSTR's history has an 8-minute print at -94% on 2026-06-27 (a broken pool tick, not a market move); it is
// reported but left out of the totals.
const EXCLUDE = new Set(['MSTR']);

function isDst(t: number): boolean {
  const d = new Date(t), y = d.getUTCFullYear();
  const nth = (m: number, n: number) => 1 + ((7 - new Date(Date.UTC(y, m, 1)).getUTCDay()) % 7) + 7 * (n - 1);
  return t >= Date.UTC(y, 2, nth(2, 2), 7) && t < Date.UTC(y, 10, nth(10, 1), 6);
}
/** The hourly bar starting at `t` closes inside the NYSE session (13:30-20:00 UTC in daylight time). */
function deskCanTrade(t: number): boolean {
  const close = t + 3600_000, d = new Date(close), day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const off = isDst(close) ? 0 : 60, m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= 13 * 60 + 30 + off + 30 && m <= 20 * 60 + off; // the first full hour after the open through the close
}

interface Run { minMargin: number; end: number; trades: number; breaches: number; margins: number[] }

/** `rule` false is a naive vault that values and trades at the raw hourly close: what the bad prints in bStock
 *  pools do to a vault without Plinth's price rule. */
function run(bars: [number, number, number, number, number][], cap: number, canTrade: (t: number) => boolean, rule = true): Run {
  const t0 = bars[0][0];
  const promise = DEPOSIT;
  let s: VaultState = { stock: 0, safe: DEPOSIT, promise, secondsLeft: YEAR_SECONDS, rate: RATE, multiplier: cap };
  const first = rebalance(s, BAND);
  s = { ...s, stock: first.deltaUsd * (1 - COST), safe: DEPOSIT - first.deltaUsd };
  let minMargin = Infinity, trades = 1, breaches = 0;
  const margins: number[] = [];
  let held = bars[0][4]; // the price the stock leg is carried at
  for (let i = 1; i < bars.length; i++) {
    const [t, , , low, close] = bars[i];
    const mark = rule ? Math.min(close, bars[i - 1][4]) : close;
    const prev = held;
    const dt = (t - bars[i - 1][0]) / 1000;
    s.secondsLeft = YEAR_SECONDS - (t + 3600_000 - t0) / 1000;
    s.safe *= Math.pow(1 + RATE, dt / YEAR_SECONDS);
    // Margin at the bar's low first (the worst moment inside the hour, before anyone can act on it).
    const floor = floorValue(promise, RATE, s.secondsLeft);
    const atLow = s.stock * (Math.min(low, mark) / prev) + s.safe - floor;
    if (atLow < 0) breaches++;
    minMargin = Math.min(minMargin, atLow);
    s.stock *= mark / prev;
    held = mark;
    if (canTrade(t)) {
      const d = rebalance(s, BAND);
      const buyRefused = rule && d.deltaUsd > 0 && close > mark * (1 + SLIPPAGE);
      if (d.trade && !buyRefused) {
        trades++;
        if (d.deltaUsd > 0) { s.safe -= d.deltaUsd; s.stock += d.deltaUsd * (1 - COST); }
        else { s.stock += d.deltaUsd; s.safe += -d.deltaUsd * (1 - COST); }
      }
    }
    margins.push(s.stock + s.safe - floorValue(promise, RATE, s.secondsLeft));
  }
  return { minMargin, end: s.stock + s.safe, trades, breaches, margins };
}

const rows: any[] = [];
for (const st of stocks) {
  const bars = hourly.bars[st.sym]?.slice(SKIP_HOURS);
  if (!bars?.length) continue;
  const on = run(bars, st.cap, () => true);
  const desk = run(bars, st.cap, deskCanTrade);
  const naive = run(bars, st.cap, () => true, false);
  rows.push({
    sym: st.sym, cap: st.cap, hours: bars.length, excluded: EXCLUDE.has(st.sym),
    alwaysOn: { minMargin: +on.minMargin.toFixed(2), end: +on.end.toFixed(2), trades: on.trades, hoursBelowFloor: on.breaches },
    desk: { minMargin: +desk.minMargin.toFixed(2), end: +desk.end.toFixed(2), trades: desk.trades, hoursBelowFloor: desk.breaches },
    naiveAlwaysOn: { minMargin: +naive.minMargin.toFixed(2), end: +naive.end.toFixed(2), trades: naive.trades, hoursBelowFloor: naive.breaches },
  });
  console.log(
    st.sym.padEnd(6), `m ${st.cap}`.padEnd(6),
    `always-on: closest to floor $${on.minMargin.toFixed(2)}, end $${on.end.toFixed(2)}, ${on.trades} trades, ${on.breaches} h below`.padEnd(70),
    `desk: closest $${desk.minMargin.toFixed(2)}, end $${desk.end.toFixed(2)}, ${desk.trades} trades, ${desk.breaches} h below`.padEnd(66),
    `naive: closest $${naive.minMargin.toFixed(2)}, end $${naive.end.toFixed(2)}`,
    EXCLUDE.has(st.sym) ? '(excluded: bad print)' : '',
  );
}
const used = rows.filter((r) => !r.excluded);
const sum = (f: (r: any) => number) => used.reduce((a, r) => a + f(r), 0);
const totals = {
  stocks: used.length,
  alwaysOnHoursBelowFloor: sum((r) => r.alwaysOn.hoursBelowFloor),
  deskHoursBelowFloor: sum((r) => r.desk.hoursBelowFloor),
  alwaysOnCloserToFloorCount: used.filter((r) => r.alwaysOn.minMargin < r.desk.minMargin).length,
  alwaysOnEndAhead: used.filter((r) => r.alwaysOn.end > r.desk.end).length,
  meanEndDiff: +(sum((r) => r.alwaysOn.end - r.desk.end) / used.length).toFixed(2),
  meanMinMarginDiff: +(sum((r) => r.alwaysOn.minMargin - r.desk.minMargin) / used.length).toFixed(2),
  naiveStocksBelowFloor: used.filter((r) => r.naiveAlwaysOn.minMargin < 0 && r.alwaysOn.minMargin >= 0).map((r) => r.sym),
  naiveWorstEnd: Math.min(...used.map((r) => r.naiveAlwaysOn.end)),
};
console.log('\n', totals);
writeFileSync(new URL(`always-on-${date}.json`, dataDir), JSON.stringify({
  generated: new Date().toISOString(), source: hourly.source, bars: file,
  config: { deposit: DEPOSIT, promise: '100%', rate: RATE, costPerTrade: COST, band: BAND, slippage: SLIPPAGE, skipFirstHours: SKIP_HOURS, multiplier: 'each stock\'s cap' },
  rule: 'Same vault, same prices. always-on may rebalance at any hourly close; desk only at closes inside the NYSE session; naiveAlwaysOn trades at the raw close with no price rule. Margin is measured at each bar\'s low, before anyone can act.',
  totals, stocks: rows,
}, null, 1));
