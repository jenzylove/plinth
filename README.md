# Plinth

**Protect your money. Keep the upside.** Capital-protected savings on tokenized US stocks (bStocks), on BSC mainnet. You deposit USDT, pick a stock and a floor (up to 100% of what you put in, at 12 months), and an agent rebalances your money around the clock to defend that floor while part of it rides the stock. Defended by code, not guaranteed.

Built for BNB Hack: Tokenized Stocks Edition.

| Start here | |
|---|---|
| Live app | https://plinth-savings.vercel.app |
| Live demo vault (real money, mainnet) | https://plinth-savings.vercel.app/demo |
| Proof: backtests, fork replays, off-hours data | https://plinth-savings.vercel.app/proof |
| Keeper agent (public state, A2A card) | https://plinth-relay.vercel.app/agent/keeper |
| Contracts (v3, Sourcify exact match) | [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) |
| What changed after two audits | [docs/PLAN.md](docs/PLAN.md) phases 8 and 9 |

## How it works

The method is the one bank desks use for capital-protected notes (CPPI), enforced by a vault contract, one per saver.

- **The floor.** Today's floor is the promise discounted at today's lending rate. The amount above it is the cushion.
- **The stock part.** Only a multiple of the cushion goes into the stock: `stock target = min(total, multiplier x cushion)`. Each stock's multiplier comes from its price history (highest with no 12-month window ending below the floor, capped at 6).
- **The safe part.** The rest is lent on Venus core or Aave v3, behind a health gate (cash, utilization, pauses, the USDT feed). If a market fails, the vault leaves it; if it will not pay out, the vault keeps tracking the position and only sells stock until it does.
- **The agent.** A BNB Agent Studio agent (ERC-8004 identity #363619) holds the factory's keeper role. Every minute it rebalances vaults that drift, cuts risk before earnings and US macro releases, and pulls the safe part out of unhealthy markets. It can cut the multiplier at once and raise it back only one step per four hours; it can never withdraw. Rebalancing is open to anyone, so vaults stay defended if the agent is down.
- **24/7.** bStocks trade when New York is shut. The vault values the stock at `min(slow reference, max(60-second average, live pool price))`: a fall that lasts is sold within about a minute; a bad print that recovers is ignored; a spike is never chased.

When does the floor fail? If the stock falls more than the break distance before anyone can trade, if the lending market fails faster than the gate, if USDT loses its peg, or if the contract has a bug. Rates float: if they fall, the floor rises and less stays in the stock. Early exit returns today's value, not the promise.

## Sponsor stack, and what each part really does

| Part | Role in Plinth |
|---|---|
| bStocks | The stock leg. 20 bStocks listed, each with its own pool, fee tier, multiplier and limits. |
| Binance Web3 API, RWA Data | Trading status and pause codes for the agent's event policy; bStock and underlying reference prices on the vault page; 3 months of hourly bStock history for the off-hours study. |
| Binance Web3 API, Market | Hourly candles for each held stock: when the last 24 hours of moves run at least 2x their usual size (medians, so one bad print cannot trigger it), the agent cuts risk to 70% of the cap until it calms. |
| Binance Web3 API, Wallet | When a saver connects, shows what the wallet already holds: USDT and any bStocks held outright with no floor under them. |
| Binance Web3 API, DeFi | Ranks every USDT earn product on BSC on the front page. The vault's own health gate chooses between Venus and Aave on chain. |
| Binance Web3 API, Trading | Aggregated quotes shown as an indicative best price. The vault trades only on its fixed PancakeSwap or Uniswap pool (RFQ routes need a wallet signature a vault cannot give), so exit estimates use that pool's quoter. |
| Binance Web3 API, Transaction | Every keeper write is simulated by the Transaction API before it is sent; a FAIL blocks it. If the API is unreachable the on-chain simulation stands and the action records that. |
| Agentic Wallet | The demo vault was opened, partly withdrawn and migrated from a Binance Agentic Wallet with Developer Mode contract-calls, each previewed first ([docs/spikes/agentic-deposit.md](docs/spikes/agentic-deposit.md)). The [Plinth skill](skills/plinth/SKILL.md) lets the wallet's AI do it in plain words ("protect $50 in Nvidia at 95%"): the relay plans the exact calls, the wallet previews each one, the user confirms, the wallet executes. |
| BNB Agent Studio | The keeper agent: ERC-8004 identity, A2A card, an ERC-8183 seller (job 56898 delivered a vault report on mainnet), hosting paid from its own wallet over x402 on NodeOps (that deployment never started; the agent runs on Railway). |

All calls to the Web3 API go through a small relay in Singapore ([relay/](relay/)) because the API refuses US addresses; it allows an exact list of read endpoints and Plinth-only simulations.

## Run it

```bash
# contracts: math tests, then fork tests against BSC mainnet (any archive RPC)
cd contracts && forge test --match-contract FloorMathTest
BSC_ARCHIVE_RPC_URL=https://bsc-mainnet.public.blastapi.io forge test --no-match-contract ReplayLab

# keeper: policy and isolation tests, then one read-only pass against mainnet
cd packages/keeper && npm ci && npm test
BSC_RPC_URL=https://bsc-dataseed1.defibit.io npx tsx src/cli.ts --once

# app
cd app && npm ci && npm run dev
```

The fork suite covers opening and closing all 20 stocks, crash sells, chunked de-risking, the audit regressions ([contracts/test/AuditFixes.t.sol](contracts/test/AuditFixes.t.sol)), permissions, and the health gate. The replay lab ([contracts/test/ReplayLab.t.sol](contracts/test/ReplayLab.t.sol)) replays real Nvidia paths against the real contracts next to two bank desks.

## Repository

| Path | What |
|---|---|
| [contracts/](contracts/) | Vault, factory, CPPI math, safe-leg and stock-leg libraries, fork tests, deploy script |
| [packages/core/](packages/core/) | CPPI math in TypeScript, calibration, backtests, off-hours studies |
| [packages/keeper/](packages/keeper/) | The keeper pass: event policy, isolation, simulation |
| [agent/plinthkeeper/](agent/plinthkeeper/) | The Agent Studio project that runs the keeper |
| [app/](app/) | The site |
| [relay/](relay/) | Web3 API relay, vault history, agent endpoint, RPC router |
| [data/](data/) | Every dataset behind a number on the site, with source and date |
| [docs/](docs/) | PRD, plan, deployments, research, build log |

MIT licensed.
