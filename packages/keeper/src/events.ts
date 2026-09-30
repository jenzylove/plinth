// Where the keeper's risk events come from. Every source is live or an official schedule; if a source
// cannot be read the keeper logs it and keeps the tighter of the last known state (fail closed).
import type { RiskEvent } from './policy.js';

import { macro } from './data.js';

/** Scheduled US macro releases (BLS, Federal Reserve), from data/macro-2026.json. */
export function macroEvents(): RiskEvent[] {
  return macro.map((e) => ({ kind: e.kind, name: e.name, at: Date.parse(e.at) / 1000 }));
}

/** Nasdaq's time labels, mapped to UTC hours during US daylight time (ET = UTC-4). */
function earningsHourUtc(label: string): number {
  if (label === 'time-pre-market') return 12; // before the 13:30 UTC open
  return 20; // after the close, or not supplied: assume after the close, the riskier case
}

/** Earnings reports for `symbols` on each of the given UTC dates, from Nasdaq's public calendar. */
export async function earningsEvents(symbols: string[], days: Date[]): Promise<{ events: RiskEvent[]; errors: string[] }> {
  const events: RiskEvent[] = [];
  const errors: string[] = [];
  const want = new Set(symbols);
  for (const d of days) {
    const date = d.toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: any = await r.json();
      for (const row of j.data?.rows ?? []) {
        if (!want.has(row.symbol)) continue;
        const [y, m, dd] = date.split('-').map(Number);
        events.push({
          kind: 'earnings',
          name: `${row.symbol} earnings (${row.time === 'time-pre-market' ? 'before open' : 'after close'} ${date})`,
          at: Date.UTC(y, m - 1, dd, earningsHourUtc(row.time)) / 1000,
          symbol: row.symbol,
        });
      }
    } catch (e) {
      errors.push(`earnings ${date}: ${(e as Error).message}`);
    }
  }
  return { events, errors };
}

/** Trading status per bStock from the Binance Web3 API (through the Singapore relay). */
export async function haltEvents(
  relay: string,
  stocks: { symbol: string; token: string }[],
): Promise<{ events: RiskEvent[]; statuses: Record<string, string>; errors: string[] }> {
  const events: RiskEvent[] = [];
  const statuses: Record<string, string> = {};
  const errors: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const s of stocks) {
    try {
      const q = new URLSearchParams({
        path: '/api/v1/dex/market/rwa/underlying-market',
        binanceChainId: '56',
        tokenContractAddress: s.token.toLowerCase(),
      });
      const r = await fetch(`${relay}/api/web3?${q}`);
      const j: any = await r.json();
      if (j.code !== 0) throw new Error(`code ${j.code} ${j.msg ?? ''}`);
      const st = j.data?.statusInfo ?? {};
      const code = String(st.reasonCode ?? 'UNKNOWN');
      statuses[s.symbol] = `${st.openState ? 'open' : 'closed'}:${code}`;
      // Only halts and pauses count. Normal closes (nights, weekends) are expected and do not cut risk.
      if (/HALT|PAUSE|SUSPEND|DELIST/i.test(code)) {
        events.push({ kind: 'halt', name: `${s.symbol} ${code}`, at: now, symbol: s.symbol });
      }
    } catch (e) {
      errors.push(`status ${s.symbol}: ${(e as Error).message}`);
    }
  }
  return { events, statuses, errors };
}
