# Build log

Date, commit, what now works. Newest last.

| Date | Commit | What now works |
|---|---|---|
| 2026-09-30 | 0fe29f9 | PRD, plan, submission checklist |
| 2026-09-30 | 2aaf0c8 | Spike S2: Web3 API signing accepted; calls geo-blocked from a US IP (code 40304) |
| 2026-09-30 | 2d4d452 | Core CPPI math, backtest and multiplier calibration in TypeScript, 11 tests. Spike S4: a contract can trade 21 bStocks |
| 2026-09-30 | bdcd563 | Vault contracts: `PlinthFactory` + `PlinthVault` (one per saver), health-gated Venus/Aave safe leg, price-guarded swaps, keeper limits. 26 Foundry tests green: 7 math tests matching the TypeScript core to 1e-9, 19 fork tests on BSC mainnet block 124,954,313 |
| 2026-09-30 | 97b79a5 | Multiplier caps for 21 stocks from 10y Yahoo prices (`data/calibration-2026-09-30.json`); `data/stocks.json` lists 20 (MRVL out); deploy script reads it; fork test opens and fully withdraws a $1,000 vault in all 20 (round trip $0.04 to $0.95). Relay code for the Web3 API in `relay/` (Vercel sin1), not deployed yet |
| 2026-09-30 | 9c250e7 | Web3 API relay live on Vercel sin1; spike S2 passes through it (price, status, platforms) |
| 2026-09-30 | 1eea3a7 | Factory live on BSC mainnet, 20 stocks listed, source verified on Sourcify (`docs/DEPLOYMENTS.md`) |
| 2026-09-30 | (this commit) | Spike S1 passed: first live vault opened from the Agentic Wallet via Developer Mode contract-call, $10 NVDA at 100% floor (`docs/spikes/agentic-deposit.md`) |

## 2026-10-01
- Replay lab (`contracts/test/ReplayLab.t.sol`): real NVDA paths (2018-11 earnings gap, worst week of July 2026) and a real Venus utilization spike on a mainnet fork. Plinth stays above its floor; at the 2018 gap it has $5.90 of margin against $0.87 for a daily bank desk at multiplier 5. It also found a keeper bug (earnings window ended before the next open), now fixed.
- App (`app/`, Vite + React + viem): front door, live vault page (`/demo` is the real mainnet vault), `/proof` with the 10-year table and the replays. Every number is read from BSC through public RPCs or from a sourced data file; when a read fails the page says so and shows nothing. Checked in headless Chromium, light and dark, desktop and phone.
- Not yet: the vault's action history (needs a log endpoint on the relay), the design pass, deployment.
- Landing redesigned to the user's reference (ramos video pin): white canvas, red and yellow, scroll motion. Approved.
- Relay `/api/vault-log` live (archive RPC server-side): the vault page shows every action.
- Site live: https://plinth-savings.vercel.app (Vercel project `plinth`, static build of `app/dist`). Checked in headless Chromium against the live domain: chain reads and history load, no console errors.
