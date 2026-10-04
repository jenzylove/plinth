// How bStocks move while NYSE is shut. Pulls each listed bStock's full hourly history from the Binance Web3
// API (RWA kline, through the Singapore relay), splits it into NYSE sessions and closed stretches (nights,
// weekends), and measures the biggest fall inside each closed stretch against the last regular-hours price.
// A bank desk can only act at the next open; Plinth's keeper can act during the stretch.
// Writes data/bstock-hourly-<date>.json (the raw bars) and data/closed-hours-<date>.json (the findings).
// Run: npx tsx scripts/closed-hours.ts
import { writeFileSync, readFileSync } from 'node:fs';

const RELAY = 'https://plinth-relay.vercel.app/api/web3';
const H = 3600_000;
const stocks: { sym: string; token: string }[] = JSON.parse(
  readFileSync(new URL('../../../data/stocks.json', import.meta.url), 'utf8'),
).stocks;
const date = new Date().toISOString().slice(0, 10);

type Bar = [number, number, number, number, number]; // open time (ms), open, high, low, close

async function page(token: string, endTime?: number): Promise<Bar[]> {
  const q = new URLSearchParams({
    path: '/api/v1/dex/market/rwa/kline', binanceChainId: '56', tokenContractAddress: token, bar: '1h', limit: '300',
  });
  if (endTime) q.set('endTime', String(endTime));
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${RELAY}?${q}`);
    const j: any = await r.json().catch(() => null);
    if (j?.code === 0) return (j.data as any[]).map((d) => [d[0], +d[1], +d[2], +d[3], +d[4]]);
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw new Error(`kline failed for ${token} at ${endTime}`);
}

async function history(token: string): Promise<Bar[]> {
  const byTime = new Map<number, Bar>();
  let end: number | undefined;
  for (let i = 0; i < 60; i++) {
    const bars = await page(token, end);
    const fresh = bars.filter((b) => !byTime.has(b[0]));
    if (!fresh.length) break;
    for (const b of fresh) byTime.set(b[0], b);
    end = Math.min(...bars.map((b) => b[0])) - 1;
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

/** US daylight time: second Sunday of March 07:00 UTC to first Sunday of November 06:00 UTC. */
function isDst(t: number): boolean {
  const d = new Date(t), y = d.getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (n - 1);
  };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7), end = Date.UTC(y, 10, nthSunday(10, 1), 6);
  return t >= start && t < end;
}

/** True when the hour starting at `t` lies inside the NYSE regular session (holidays not modelled: a holiday
 *  counts as open, which can only hide closed-hours moves, never invent them). */
function nyseOpen(t: number): boolean {
  const d = new Date(t), day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const off = isDst(t) ? 0 : 1; // the session is 13:30-20:00 UTC in daylight time, an hour later otherwise
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  // An hourly bar counts as open if it overlaps the session.
  return mins + 60 > (13 * 60 + 30 + off * 60) && mins < (20 + off) * 60;
}

interface Stretch {
  sym: string; from: string; to: string; hours: number;
  lastClose: number; low: number; lowAt: string; nextOpen: number;
  worstInside: number; atOpen: number;
}

const raw: Record<string, Bar[]> = {};
const stretches: Stretch[] = [];
for (const s of stocks) {
  const bars = await history(s.token);
  raw[s.sym] = bars.map((b) => [b[0], +b[1].toFixed(4), +b[2].toFixed(4), +b[3].toFixed(4), +b[4].toFixed(4)]);
  let lastClose = 0, inClosed = false, cur: Stretch | null = null;
  for (const b of bars) {
    const open = nyseOpen(b[0]);
    if (open) {
      if (cur) {
        cur.nextOpen = b[1];
        cur.atOpen = b[1] / cur.lastClose - 1;
        cur.to = new Date(b[0]).toISOString();
        stretches.push(cur);
        cur = null;
      }
      lastClose = b[4];
      inClosed = false;
    } else if (lastClose > 0) {
      if (!inClosed) {
        cur = { sym: s.sym, from: new Date(b[0]).toISOString(), to: '', hours: 0, lastClose, low: b[3], lowAt: new Date(b[0]).toISOString(), nextOpen: 0, worstInside: 0, atOpen: 0 };
        inClosed = true;
      }
      cur!.hours++;
      if (b[3] < cur!.low) { cur!.low = b[3]; cur!.lowAt = new Date(b[0]).toISOString(); }
      cur!.worstInside = cur!.low / cur!.lastClose - 1;
    }
  }
  const mine = stretches.filter((x) => x.sym === s.sym);
  const worst = mine.reduce((a, b) => (b.worstInside < a.worstInside ? b : a), mine[0]);
  console.log(
    s.sym.padEnd(6), `${bars.length} h from ${new Date(bars[0]?.[0] ?? 0).toISOString().slice(0, 10)}`.padEnd(24),
    `closed stretches ${mine.length}`.padEnd(22),
    worst ? `worst fall while shut ${(worst.worstInside * 100).toFixed(2)}% (${worst.lowAt.slice(0, 16)}), at next open ${(worst.atOpen * 100).toFixed(2)}%` : '',
  );
}

const ranked = [...stretches].sort((a, b) => a.worstInside - b.worstInside);
const summary = stocks.map((s) => {
  const mine = stretches.filter((x) => x.sym === s.sym);
  return {
    sym: s.sym,
    hours: raw[s.sym].length,
    from: raw[s.sym][0] ? new Date(raw[s.sym][0][0]).toISOString().slice(0, 10) : null,
    closedStretches: mine.length,
    fellOver2: mine.filter((x) => x.worstInside <= -0.02).length,
    fellOver5: mine.filter((x) => x.worstInside <= -0.05).length,
    worstInside: mine.length ? Math.min(...mine.map((x) => x.worstInside)) : null,
  };
});
const source = 'Binance Web3 API /api/v1/dex/market/rwa/kline, bar=1h, BSC (chain 56), through plinth-relay (sin1)';
writeFileSync(new URL(`../../../data/bstock-hourly-${date}.json`, import.meta.url), JSON.stringify({ generated: new Date().toISOString(), source, bars: raw }));
writeFileSync(
  new URL(`../../../data/closed-hours-${date}.json`, import.meta.url),
  JSON.stringify({
    generated: new Date().toISOString(), source,
    rule: 'A closed stretch runs from the last NYSE regular-hours bar to the next one (nights, weekends; holidays count as open). worstInside = lowest low inside the stretch / last regular-hours close - 1. atOpen = next session open / last close - 1.',
    summary, worst: ranked.slice(0, 25),
  }, null, 1),
);
console.log('\nworst falls while NYSE was shut:');
for (const x of ranked.slice(0, 10)) {
  console.log(`${x.sym.padEnd(6)} ${x.from.slice(0, 16)} +${x.hours}h  low ${(x.worstInside * 100).toFixed(2)}% at ${x.lowAt.slice(0, 16)}  next open ${(x.atOpen * 100).toFixed(2)}%`);
}
