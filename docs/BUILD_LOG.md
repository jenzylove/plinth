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

## 2026-10-04 v2 end to end on a local BSC fork
- anvil fork of mainnet (Blast public archive RPC, chain id 56). v2 factory deployed with the 20 stocks, keeper = the new Agent Studio wallet 0xB12a1e4e0E22A97E266eD7a6bfc4133F699b1A1b. Two vaults opened: $1,000 NVDA at 100%, $1,000 QQQ at 90%.
- The Studio agent (`bag dev`, keeper every 20 s) read both vaults and the Web3 API trading status, and did nothing while both sat inside their band.
- 01:24:28 UTC: 500 QQQB (~$360k) sold into the real PancakeSwap pool, about -10% in one block.
- 01:24:36 and 01:24:41: the agent's simulated sells were refused ("Too little received") while the 60-second price caught up.
- 01:25:04: sell sent and mined, $168 of QQQB sold, 36 seconds after the crash. Under v1 (10-minute TWAP only) the same sell stays refused for up to ten minutes (fork test `test_v1Rule_slowPriceAloneCannotSellInACrash`).
- 01:26:51: the agent pulled both safe legs out of Venus on gate code 4: on a fork the USDT price feed goes stale as time passes, and the gate fails closed. A fork artifact, and the fail-safe working.
