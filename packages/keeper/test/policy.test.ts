import { describe, it, expect } from 'vitest';
import { decide, needsTrade, type RiskEvent } from '../src/policy.js';

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
    expect(decide(nvda, [earnings], T + 13 * 3600).multiplier).toBe(5.7);
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
