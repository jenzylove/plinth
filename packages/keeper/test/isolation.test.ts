import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keeper } from '../src/keeper.js';

const WAD = 10n ** 18n;
const FACTORY = '0x0000000000000000000000000000000000000f00' as const;
const GOOD = '0x000000000000000000000000000000000000a001' as const;
const BAD = '0x000000000000000000000000000000000000a002' as const;
const NVDA = '0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436';

// A vault whose stock leg ($50) sits far below its target, so a rebalance is due.
const status = {
  total: 1000n * WAD, stockUsd: 50n * WAD, safeUsd: 950n * WAD, price: 230n * WAD, slowPrice: 230n * WAD, fastPrice: 230n * WAD,
  floor: 968n * WAD, target: 182n * WAD, breakDistance: WAD / 5n, floorRate: WAD / 30n, multiplier: 57n * WAD / 10n,
  cap: 57n * WAD / 10n, promised: 1000n * WAD, deposited: 1000n * WAD, maturity: 9_999_999_999n, marketIndex: 1n, gateCode: 0,
  nextRaiseAt: 0n, idleSince: 0n, excess: 0n, impaired: false, exiting: false,
};

function fakeClient() {
  return {
    getBlockNumber: async () => 1n,
    simulateContract: async () => ({}),
    readContract: async ({ address, functionName, args }: any) => {
      if (address === FACTORY) {
        if (functionName === 'keeper') return '0x0000000000000000000000000000000000000001';
        if (functionName === 'vaultCount') return 2n;
        if (functionName === 'minTrade') return WAD;
        if (functionName === 'vaults') return args[0] === 0n ? BAD : GOOD;
      }
      if (address === BAD) throw new Error('invalid resilient oracle price');
      if (functionName === 'status') return status;
      if (functionName === 'stock') return { token: NVDA, band: WAD / 10n };
      throw new Error(`unexpected ${functionName}`);
    },
  } as any;
}

afterEach(() => vi.unstubAllGlobals());

describe('one failing vault or source does not stop the pass', () => {
  it('H3: an unreadable vault is reported and skipped; the healthy vault is still rebalanced', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { status: 'SUCCESS', rows: [], statusInfo: {} } }))));
    const k = new Keeper({ rpcUrl: '', factory: FACTORY, relay: 'https://relay', dryRun: true, client: fakeClient(), now: () => 1_800_000_000 });
    const r = await k.pass();
    expect(r.errors.some((e) => e.includes(BAD))).toBe(true);
    expect(r.actions.some((a) => a.vault === GOOD && a.kind === 'rebalance' && a.status === 'would-send')).toBe(true);
  });

  it('H4: event sources that never answer cannot hold the pass; raises are blocked for that pass', async () => {
    // Nasdaq and the trading-status relay hang forever; the Transaction API simulation answers.
    vi.stubGlobal('fetch', vi.fn((url: string, init?: any) =>
      init?.method === 'POST'
        ? Promise.resolve(new Response(JSON.stringify({ code: 0, data: { status: 'SUCCESS' } })))
        : new Promise<Response>(() => {})));
    const k = new Keeper({ rpcUrl: '', factory: FACTORY, relay: 'https://relay', dryRun: true, client: fakeClient(), now: () => 1_800_000_000, eventsDeadlineMs: 200 });
    const started = Date.now();
    const r = await k.pass();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.errors.some((e) => e.includes('did not answer'))).toBe(true);
    expect(r.actions.some((a) => a.vault === GOOD && a.kind === 'rebalance')).toBe(true);
  });
});
