// Copied from packages/keeper/src/data.ts by scripts/sync-agent.sh. Edit the original.
import type { RiskEvent } from './policy.js';

// Imported rather than read from disk so a bundled keeper (the Agent Studio build ships one JS file) carries its data.
import stocksFile from './data/stocks.json' with { type: 'json' };
import gapsFile from './data/gaps-2026-09-30.json' with { type: 'json' };
import macroFile from './data/macro-2026.json' with { type: 'json' };

export const stocks = stocksFile.stocks as { sym: string; token: string }[];
export const gaps = gapsFile.stocks as { sym: string; eventCap: number }[];
export const macro = macroFile.events as { kind: RiskEvent['kind']; name: string; at: string }[];
