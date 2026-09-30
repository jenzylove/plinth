# Build log

Date, commit, what now works. Newest last.

| Date | Commit | What now works |
|---|---|---|
| 2026-09-30 | 0fe29f9 | PRD, plan, submission checklist |
| 2026-09-30 | 2aaf0c8 | Spike S2: Web3 API signing accepted; calls geo-blocked from a US IP (code 40304) |
| 2026-09-30 | 2d4d452 | Core CPPI math, backtest and multiplier calibration in TypeScript, 11 tests. Spike S4: a contract can trade 21 bStocks |
| 2026-09-30 | bdcd563 | Vault contracts: `PlinthFactory` + `PlinthVault` (one per saver), health-gated Venus/Aave safe leg, price-guarded swaps, keeper limits. 26 Foundry tests green: 7 math tests matching the TypeScript core to 1e-9, 19 fork tests on BSC mainnet block 124,954,313 |
| 2026-09-30 | 97b79a5 | Multiplier caps for 21 stocks from 10y Yahoo prices (`data/calibration-2026-09-30.json`); `data/stocks.json` lists 20 (MRVL out); deploy script reads it; fork test opens and fully withdraws a $1,000 vault in all 20 (round trip $0.04 to $0.95). Relay code for the Web3 API in `relay/` (Vercel sin1), not deployed yet |
| 2026-09-30 | (this commit) | Web3 API relay live on Vercel sin1; spike S2 passes through it (price, status, platforms) |
