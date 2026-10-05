import { describe, it, expect } from 'vitest';
import { decide, needsTrade, nextMultiplier, type RiskEvent } from '../src/policy.js';

const nvda = { symbol: 'NVDA', cap: 5.7, eventCap: 4.1 };
const T = Date.UTC(2026, 10, 18, 21, 0) / 1000; // an earnings report time
const earnings: RiskEvent = { kind: 'earnings', name: 'NVDA earnings', at: T, symbol: 'NVDA' };
const jobs: RiskEvent = { kind: 'jobs', name: 'US jobs report', at: Date.UTC(2026, 9, 2, 12, 30) / 1000 };

describe('event policy', () => {
  it('full cap with nothing scheduled', () => {
    expect(decide(nvda, [earnings, jobs], T - 5 * 86400).multiplier).toBe(5.7);
  });
  it('cuts to the gap-sized cap in the earnings window', () => {
    expect(decide(nvda, [earnings], T - 23 * 3600).multiplier).toBe(4.1);
    expect(decide(nvda, [earnings], T + 11 * 3600).multiplier).toBe(4.1);
    expect(decide(nvda, [earnings], T + 25 * 3600).multiplier).toBe(5.7);
  });
  it('holds the cut through the next open after an after-close report', () => {
    // Nvidia reported 2018-11-15 21:20 UTC; the -19.3% gap landed at the 14:30 UTC open next day.
    const report = Date.UTC(2018, 10, 15, 21, 20) / 1000, nextOpen = Date.UTC(2018, 10, 16, 14, 30) / 1000;
    expect(decide(nvda, [{ ...earnings, at: report }], nextOpen).multiplier).toBe(4.1);
  });
  it('ignores other stocks earnings', () => {
    expect(decide({ ...nvda, symbol: 'TSLA' }, [earnings], T).multiplier).toBe(5.7);
  });
  it('trims 25% before a market-wide release', () => {
    const d = decide(nvda, [jobs], jobs.at - 3600);
    expect(d.multiplier).toBe(4.2); // floor(5.7 x 0.75, 0.1)
    expect(decide(nvda, [jobs], jobs.at + 2 * 3600).multiplier).toBe(5.7);
  });
  it('takes the tightest of overlapping events and never exceeds the cap', () => {
    expect(decide(nvda, [jobs, { ...earnings, at: jobs.at }], jobs.at).multiplier).toBe(4.1);
    expect(decide({ symbol: 'QQQ', cap: 6, eventCap: 6 }, [], 0).multiplier).toBe(6);
  });
  it('halves on a halt', () => {
    expect(decide(nvda, [{ kind: 'halt', name: 'NVDA halted', at: 0, symbol: 'NVDA' }], 0).multiplier).toBe(2.8);
  });
});

describe('band rule matches the contract', () => {
  it('trades outside the band only', () => {
    expect(needsTrade(100, 105, 0.1, 1)).toBe(false);
    expect(needsTrade(100, 150, 0.1, 1)).toBe(true);
    expect(needsTrade(100, 0, 0.1, 1)).toBe(true);
    expect(needsTrade(0, 0.5, 0.1, 1)).toBe(false);
  });
});

describe('raise rule', () => {
  it('cuts at once', () => {
    expect(nextMultiplier(5.7, 4.2, 9e9, 0)).toBe(4.2);
  });
  it('waits for the raise interval', () => {
    expect(nextMultiplier(4.2, 5.7, 1000, 999)).toBeNull();
  });
  it('raises one step at a time, never past the target', () => {
    expect(nextMultiplier(4.2, 5.7, 1000, 1000)).toBe(5.2);
    expect(nextMultiplier(5.2, 5.7, 1000, 2000)).toBe(5.7);
    expect(nextMultiplier(0, 4.1, 0, 1)).toBe(1);
  });
  it('sends nothing when already there', () => {
    expect(nextMultiplier(5.7, 5.7, 0, 1)).toBeNull();
  });
});

import { volatilityRatio } from '../src/policy.js';

describe('volatility signal', () => {
  const calm = Array.from({ length: 300 }, (_, i) => 100 * (1 + 0.002 * Math.sin(i)));
  it('calm history: ratio near 1, no cut', () => {
    expect(volatilityRatio(calm)!).toBeLessThan(1.5);
  });
  it('a single bad print does not trigger it', () => {
    const spiky = [...calm]; spiky[290] = 150;
    expect(volatilityRatio(spiky)!).toBeLessThan(1.5);
  });
  it('a day of large moves does', () => {
    const wild = calm.map((p, i) => (i >= 276 ? p * (1 + 0.02 * Math.sin(i * 1.7)) : p));
    expect(volatilityRatio(wild)!).toBeGreaterThan(2);
  });
  it('a volatility event cuts to 70% of the cap', () => {
    const d = decide(nvda, [{ kind: 'volatility', name: 'NVDA moves at 2.4x', at: 0, symbol: 'NVDA' }], 0);
    expect(d.multiplier).toBe(3.9); // floor(5.7 x 0.7, 0.1)
  });
});
