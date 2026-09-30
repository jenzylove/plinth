import { describe, expect, it } from 'vitest';
import {
  breakDistance,
  cushion,
  floorValue,
  rebalance,
  startingExposure,
  targetStock,
  YEAR_SECONDS,
  type VaultState,
} from '../src/cppi.js';
import { backtest, calibrateMultiplier, runWindow, type Bar } from '../src/calibrate.js';

const base: VaultState = { stock: 0, safe: 1000, promise: 1000, secondsLeft: YEAR_SECONDS, rate: 0.035, multiplier: 4.1 };

describe('floor and cushion', () => {
  it('discounts the promise at the safe rate', () => {
    expect(floorValue(1000, 0.035, YEAR_SECONDS)).toBeCloseTo(966.18, 2);
    expect(floorValue(1000, 0.035, 0)).toBe(1000);
  });
  it('cushion is value above floor and never negative', () => {
    expect(cushion(base)).toBeCloseTo(33.82, 2);
    expect(cushion({ ...base, safe: 900 })).toBe(0);
  });
});

describe('exposure', () => {
  it('matches the PRD front-door number for Nvidia at a 100% floor', () => {
    expect(startingExposure(1000, 1, 0.035, 4.1)).toBeCloseTo(138.65, 2);
  });
  it('never exceeds the whole vault (no leverage)', () => {
    expect(targetStock({ ...base, promise: 500, multiplier: 6 })).toBe(1000);
  });
  it('break distance equals cushion over stock', () => {
    const s = { ...base, stock: 138.7, safe: 861.3 };
    expect(breakDistance(s)).toBeCloseTo(cushion(s) / 138.7, 6);
    expect(breakDistance(base)).toBe(Infinity);
  });
});

describe('rebalance', () => {
  it('stays put inside the band', () => {
    const s = { ...base, stock: 135, safe: 865 };
    expect(rebalance(s).trade).toBe(false);
  });
  it('sells everything when the cushion is gone', () => {
    const s = { ...base, stock: 50, safe: 900 };
    const d = rebalance(s);
    expect(d.reason).toBe('cushion-gone');
    expect(d.deltaUsd).toBe(-50);
  });
  it('sells after a drop that pushes stock above target', () => {
    const s = { ...base, stock: 138.7 * 0.8, safe: 861.3 };
    const d = rebalance(s);
    expect(d.trade).toBe(true);
    expect(d.deltaUsd).toBeLessThan(0);
  });
});

describe('backtest harness', () => {
  const flat: Bar[] = Array.from({ length: 600 }, (_, i) => ({ t: i * 86400, open: 100, close: 100 }));
  it('a flat stock returns the promise plus a little from the safe leg, never below', () => {
    const v = runWindow(flat, 0, { promiseFraction: 1, rate: 0.035, multiplier: 4, cost: 0.003, band: 0.1, termDays: 252 });
    expect(v).toBeGreaterThanOrEqual(1000);
  });
  it('a crash to zero in one gap with a small multiplier still holds the floor', () => {
    const crash: Bar[] = flat.map((b, i) => (i >= 10 ? { ...b, open: 70, close: 70 } : b));
    const r = backtest(crash, { promiseFraction: 1, rate: 0.035, multiplier: 3, cost: 0.003, band: 0.1, termDays: 252 });
    expect(r.breaches).toBe(0);
  });
  it('short history falls back to multiplier 3', () => {
    expect(calibrateMultiplier(flat.slice(0, 300))).toBe(3);
  });
});
