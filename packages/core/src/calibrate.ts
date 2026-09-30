// Multiplier calibration and backtest over real daily prices.
// Rule: for each stock, the multiplier is the highest value (step 0.1, cap 6) that never ended a
// 12-month window below the floor across the stock's price history. History shorter than two years -> 3.

import { floorValue, targetStock, YEAR_SECONDS } from './cppi.js';

export interface Bar {
  /** Unix seconds of the session. */
  t: number;
  open: number;
  close: number;
}

export interface BacktestConfig {
  promiseFraction: number;
  rate: number;
  multiplier: number;
  /** Cost per traded dollar (0.003 = 0.3%). */
  cost: number;
  /** Drift band before trading (fraction of target). */
  band: number;
  /** Trading days in one term. */
  termDays: number;
}

export const DEFAULT_CONFIG: Omit<BacktestConfig, 'multiplier'> = {
  promiseFraction: 1,
  rate: 0.035,
  cost: 0.003,
  band: 0.1,
  termDays: 252,
};

/**
 * Run one term starting at bars[start]. Rebalances once per session at the open, which is the
 * harsh bank-desk assumption: overnight gaps hit the position before anything can be sold.
 * Returns the final value of a $1,000 deposit.
 */
export function runWindow(bars: Bar[], start: number, cfg: BacktestConfig): number {
  const deposit = 1000;
  const promise = deposit * cfg.promiseFraction;
  const dayRate = Math.pow(1 + cfg.rate, 1 / 252);
  let stock = 0;
  let safe = deposit;
  const trade = (target: number) => {
    const traded = Math.abs(target - stock);
    safe -= target - stock + traded * cfg.cost;
    stock = target;
  };
  trade(targetStock({ stock, safe, promise, secondsLeft: YEAR_SECONDS, rate: cfg.rate, multiplier: cfg.multiplier }));
  for (let i = start + 1; i <= start + cfg.termDays; i++) {
    stock *= bars[i].open / bars[i - 1].close; // overnight gap, no chance to act
    safe *= dayRate;
    const secondsLeft = ((start + cfg.termDays - i) / 252) * YEAR_SECONDS;
    const target = targetStock({ stock, safe, promise, secondsLeft, rate: cfg.rate, multiplier: cfg.multiplier });
    const drift = target === 0 ? Infinity : Math.abs(target - stock) / target;
    if ((target === 0 && stock > 0) || drift > cfg.band) trade(target);
    stock *= bars[i].close / bars[i].open; // intraday move
  }
  return stock + safe;
}

export interface BacktestSummary {
  windows: number;
  min: number;
  median: number;
  max: number;
  breaches: number;
  beatSafeOnly: number;
}

export function backtest(bars: Bar[], cfg: BacktestConfig, stepDays = 5): BacktestSummary {
  const finals: number[] = [];
  for (let s = 0; s + cfg.termDays < bars.length; s += stepDays) finals.push(runWindow(bars, s, cfg));
  const sorted = [...finals].sort((a, b) => a - b);
  const promise = 1000 * cfg.promiseFraction;
  const safeOnly = 1000 * (1 + cfg.rate);
  return {
    windows: finals.length,
    min: sorted[0] ?? NaN,
    median: sorted[Math.floor(sorted.length / 2)] ?? NaN,
    max: sorted[sorted.length - 1] ?? NaN,
    breaches: finals.filter((f) => f < promise - 0.5).length,
    beatSafeOnly: finals.length ? finals.filter((f) => f > safeOnly).length / finals.length : 0,
  };
}

export const MULTIPLIER_CAP = 6;
export const SHORT_HISTORY_MULTIPLIER = 3;

/** Highest multiplier with zero breaches over the history, in steps of 0.1, capped. */
export function calibrateMultiplier(bars: Bar[], base = DEFAULT_CONFIG): number {
  if (bars.length < 2 * 252) return SHORT_HISTORY_MULTIPLIER;
  let best = 1;
  for (let m = 1; m <= MULTIPLIER_CAP + 1e-9; m = Math.round((m + 0.1) * 10) / 10) {
    const r = backtest(bars, { ...base, multiplier: m });
    if (r.breaches === 0) best = m;
    else break;
  }
  return best;
}

// Keep floorValue exported for consumers who import from here.
export { floorValue };
