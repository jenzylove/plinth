// Copied from packages/keeper/src/policy.ts by scripts/sync-agent.sh. Edit the original.
// Event-risk policy. Pure functions: given the stock's cap and the events around now, return the
// multiplier the keeper should set. The contract refuses anything above the cap, so this can only lower.

export interface RiskEvent {
  kind: 'earnings' | 'jobs' | 'cpi' | 'fomc' | 'halt';
  name: string;
  /** Unix seconds. For 'halt' this is when it was observed. */
  at: number;
  /** Ticker for earnings and halts; undefined for market-wide releases. */
  symbol?: string;
}

export interface StockRisk {
  symbol: string;
  /** Contract cap for this vault, e.g. 5.7. */
  cap: number;
  /** min(6, 1 / (1.25 x worst 10y overnight gap)) from data/gaps-*.json. */
  eventCap: number;
}

export interface Decision {
  multiplier: number;
  reason: string;
  events: RiskEvent[];
}

const H = 3600;
/** Earnings: from 24 h before the report to 24 h after it. The gap lands at the next NYSE open, up to
 *  ~17 h after an after-close report (21:20 UTC report, 14:30 UTC open), so the window must outlast it. */
export const EARNINGS_WINDOW = { before: 24 * H, after: 24 * H };
/** Market-wide releases: from 12 h before to 1 h after. */
export const MACRO_WINDOW = { before: 12 * H, after: 1 * H };
/** Safety margin before market-wide releases. A policy choice, not derived from data. */
export const MACRO_FACTOR = 0.75;
export const HALT_FACTOR = 0.5;

const floor1 = (x: number) => Math.floor(x * 10 + 1e-9) / 10;

function inWindow(now: number, at: number, w: { before: number; after: number }) {
  return now >= at - w.before && now <= at + w.after;
}

export function decide(stock: StockRisk, events: RiskEvent[], now: number): Decision {
  let m = stock.cap;
  const reasons: string[] = [];
  const hit: RiskEvent[] = [];
  for (const e of events) {
    if (e.kind === 'earnings' && e.symbol === stock.symbol && inWindow(now, e.at, EARNINGS_WINDOW)) {
      if (stock.eventCap < m) m = stock.eventCap;
      reasons.push(`${e.name}: sized for ${stock.symbol}'s worst 10-year overnight gap`);
      hit.push(e);
    } else if ((e.kind === 'jobs' || e.kind === 'cpi' || e.kind === 'fomc') && inWindow(now, e.at, MACRO_WINDOW)) {
      m = Math.min(m, stock.cap * MACRO_FACTOR);
      reasons.push(`${e.name}: 25% margin before a market-wide release`);
      hit.push(e);
    } else if (e.kind === 'halt' && e.symbol === stock.symbol) {
      m = Math.min(m, stock.eventCap, stock.cap * HALT_FACTOR);
      reasons.push(`${e.name}: trading halted or paused`);
      hit.push(e);
    }
  }
  m = Math.min(floor1(m), stock.cap);
  return { multiplier: m, reason: reasons.length ? reasons.join('; ') : 'no scheduled risk: full cap', events: hit };
}

/** Same band rule as the contract (FloorMath.decide). Amounts in USD. */
export function needsTrade(stockUsd: number, target: number, band: number, minTrade: number): boolean {
  if (target === 0 && stockUsd > 0) return true;
  const d = Math.abs(target - stockUsd);
  if (d < minTrade) return false;
  return d / target > band;
}
