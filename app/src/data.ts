// Sourced data files from /data. Each carries its own source and date, shown next to the numbers.
import stocksFile from '@data/stocks.json';
import calibrationFile from '@data/calibration-2026-09-30.json';
import gapsFile from '@data/gaps-2026-09-30.json';
import replayPaths from '@data/replay-paths.json';
import replay2018 from '@data/replay-nvda-2018-11.json';
import replay2026 from '@data/replay-nvda-2026-07.json';
import replayUtil from '@data/replay-venus-utilization.json';

export const NAMES: Record<string, string> = {
  AAPL: 'Apple', AMZN: 'Amazon', BABA: 'Alibaba', CRCL: 'Circle', GME: 'GameStop', GOOGL: 'Alphabet',
  HOOD: 'Robinhood', INTC: 'Intel', META: 'Meta', MSFT: 'Microsoft', MSTR: 'Strategy', NFLX: 'Netflix',
  NVDA: 'Nvidia', QQQ: 'Nasdaq-100', SKHY: 'SK Hynix', SNDK: 'SanDisk', SPCX: 'SpaceX', SPY: 'S&P 500',
  TSLA: 'Tesla', TSM: 'TSMC',
};

export interface Calibration {
  sym: string; ticker: string; days: number; from: string; multiplier: number; windows: number;
  min: number; median: number; max: number; breaches: number; beatSafeOnly: number;
}

export const calibration = calibrationFile as { generated: string; source: string; rule: string; config: Record<string, number>; stocks: Calibration[] };
export const gaps = gapsFile as { generated: string; source: string; rule: string; stocks: { sym: string; worstGap: number; on: string; eventCap: number }[] };
export const stocks = stocksFile.stocks as { sym: string; token: string; cap: number }[];

export const symOf = (token: string) => stocks.find((s) => s.token.toLowerCase() === token.toLowerCase())?.sym;
export const calibrationOf = (sym: string) => calibration.stocks.find((c) => c.sym === sym);
export const gapOf = (sym: string) => gaps.stocks.find((g) => g.sym === sym);

export interface ReplayResult {
  name: string; forkBlock: number; at: number[];
  plinthTotal: string[]; floor: string[]; plinthStock: string[]; plinthMultiplier: string[];
  bankTotal: string[]; bankStock: string[]; nvdaPrice: string[]; bankCutTotal: string[];
  plinthEverBelowFloor: boolean; bankEverBelowFloor: boolean; bankCutEverBelowFloor: boolean;
}
export const replays = { paths: replayPaths, results: [replay2018, replay2026] as unknown as ReplayResult[], utilization: replayUtil };

import closedHoursFile from '@data/closed-hours-2026-10-04.json';
import alwaysOnFile from '@data/always-on-2026-10-04.json';

export interface ClosedStretch { sym: string; from: string; to: string; hours: number; lastClose: number; low: number; lowAt: string; nextOpen: number; worstInside: number; atOpen: number }
export const closedHours = closedHoursFile as unknown as { generated: string; source: string; rule: string; worst: ClosedStretch[]; summary: { sym: string; hours: number; from: string; closedStretches: number; fellOver2: number; fellOver5: number; worstInside: number }[] };

interface Run { minMargin: number; end: number; trades: number; hoursBelowFloor: number }
export const alwaysOn = alwaysOnFile as unknown as {
  generated: string; source: string; rule: string;
  config: Record<string, string | number>;
  totals: { stocks: number; alwaysOnHoursBelowFloor: number; deskHoursBelowFloor: number; meanEndDiff: number; meanMinMarginDiff: number; naiveStocksBelowFloor: string[]; naiveWorstEnd: number };
  stocks: { sym: string; cap: number; hours: number; excluded: boolean; alwaysOn: Run; desk: Run; naiveAlwaysOn: Run }[];
};
