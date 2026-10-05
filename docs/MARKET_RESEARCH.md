# Market and contract research

The measurements behind Plinth's numbers, with dates. Prices, pools and rates move; every figure is as of the date shown,
and the live site reads current ones from chain.

## Mainnet facts measured 2026-09-30 (publicnode RPC)
- NVDAB 0x02fca66c...a7436: supply 151,710, uiMultiplier 1.000778, main pool PancakeSwap v3 0.25% NVDAB/USDT ~7,331 NVDAB (~$1.7M), price ~$228.68
- TSLAB 0x5b1910ea...c292f: supply 62,920, best pool ~3,035 TSLAB, price ~$352.45
- NVDAon 0xa9ee28c8...016f75: supply 71,929 (~$16.4M), best AMM pool 12.3 NVDAon. Transfers call compliance(); pause via tokenPauseManager. Transfer to fresh address simulates OK.
- NVDAx 0xc845b289...0849d on BSC: supply 41,193, multiplier 1.0017, newMultiplierActivationTime, isPaused
- Ondo on BSC: 459 tokens; most have ZERO PancakeSwap depth (AAPL, MSFT, META, COIN, MSTR 133k, HOOD 44.8k, CRCL 1.01M tokens, PLTR, AVGO, ORCL...). They trade only by RFQ / mint-redeem.
- Venus prices NVDAB with token-level NVDAB/USD feeds, updated hourly all weekend (no weekend freeze).
- Killed with evidence: Venus multiplier mispricing, weekend oracle freeze, LP dividend leak (0.08%), chaos lab (Horoi), index tokens (Reserve DTFs on BSC), stock loans (Fortion), weekend-exit pool (Ondo 24/7 mint/redeem live Sep 2026 for NVDA TSLA SPY QQQ CRCL GOOGL)

## Stock universe (2026-09-30)
- 68 bStocks on BSC (official eligible list with addresses). Mainnet quote of a $10k sell (PancakeSwap v3 + Uniswap v3, USDT/USDC): 19 names cost <=1%: AAPL .06, AMZN .44, BABA .04, CRCL .19, GME .55, GOOGL .39, HOOD .78, META .53, MRVL .48, MSFT .42, MSTR .51, NVDA .12, QQQ .03, SKHY .17, SNDK .50, SPCX .46, SPY .06, TSLA .42, TSM .85. Marginal: INTC 1.25, NFLX 1.18. Pools that look usable but aren't: COIN 84%, ORCL 41%, MU 9%. ~33 have no v3 pool.
- 10y worst overnight gaps (Yahoo): NVDA -19.3, TSLA -14.9, META -24.5, NFLX -29.7, MSTR -27.4, INTC -24.5, GME -37.4, AAPL -13.0, MSFT -11.9, GOOGL -10.3, SPY -10.4, QQQ -9.5, TSM -11.3.
- Multiplier rule: m = 1 / (1.25 x worst 10y overnight gap), capped at 6; history < 2 years -> m = 3. Exposure capped at 100% (no leverage). Eligibility recomputed daily by the agent from live depth + gap history.
- Yield is core; if no pool passes the health gate, funds wait in USDT (a fallback, not a mode).

## Backtest (10y Yahoo daily, 452 rolling 12-month windows, rebalance once a day at the open, 0.3% cost, 10% band, 3.5% safe yield)
- 100% floor: NVDA (m4.1) min 1000 / median 1065 / max 2361, beat Venus(1035) 59%, 0 breaches. QQQ (m6) 1000/1042/1438, 56%. AAPL (m6) 1000/1027/1639, 42%. SPY (m6) 1002/1037/1255, 52%. META (m3.3) 1000/1040/1959, 53%.
- TSLA m5.4 breached 8 windows (min 993); m4 -> 0 breaches (median 1006), m3 -> 0 (median 1017, 34%). => multiplier rule = largest m with ZERO floor breaches over 10y of real prices (captures gaps AND whipsaw), capped at 6.
- Early exit after 2 months at 100% floor: worst ~$971-974 (the promise is at 12 months; early exit = today's value).
- Decisions: headline = 100% floor ("get your money back at 12 months"); 95/90 = optional more exposure. No lock: withdraw any time at today's value, worst-case exit shown live. Vault auto-sells toward safety as the stock falls (the "close"); if the cushion hits zero it sits in the safe leg until maturity.

## Contract facts (fork of block 124,954,313, 2026-09-30)
- Venus prices only NVDA, TSLA, SKHY, SPCX among liquid bStocks. Others use the pool's TWAP (600 s window) as reference price.
- Venus vUSDT supply APR at the fork: 3.24% (supplyRatePerBlock x 70,064,000). Aave v3 USDT: 2.99%. Vaults pick the higher one that passes the health gate.
- QQQB PancakeSwap v3 0.01% pool: selling 500 QQQB (~$370k) moves the price ~10%; 550 QQQB (~$400k) empties the liquidity range and the price collapses. Depth has a cliff, not a slope.
- $1,000 NVDA vault at 100% floor, m 4.1: $128.50 in stock, floor $968.60, break distance 24.3%. Withdraw-all right after open returns $999.87.

## Agent Studio runtime options (checked 2026-09-30, CLI `bag` 0.0.14 from `npm i -g @bnbagent/studio-cli`)
- Studio scaffolds request-driven seller agents (A2A or MCP, optional ERC-8183 jobs, B402/x402 selling). No cron or scheduler command.
- Providers (`bag deploy --provider bnb|aws|azure|nodeops`):
  - bnb (managed): 48-hour trial, BSC testnet only.
  - azure: 48-hour trial with a shared $1,000 credit pool, testnet only, container and A2A only.
  - aws: AgentCore in your own AWS account.
  - nodeops (CreateOS): wallet mode pays hosting from the agent's own wallet in BSC USDC over MPP or x402, no account needed. Hosting chain is separate from the agent's business network. Example caps in the docs: $5 per payment, $20 per month (not a quote).
- Wallet mode cannot learn its public URL before deploy; the docs require a stable hostname plus a reverse proxy set up after deploy (we have Vercel for that).
- ERC-8004: `bag erc8004 register --network bsc-mainnet`, gas sponsored by MegaFuel or self-paid. Another hackathon repo measured ~163k gas (~$0.006) on registry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 and judged the managed runtime a no-go for a scheduler.
- LLM: Pieverse LLM with opt-in x402 auto top-up (`bag budget`).
- Plan at the time: keeper = Studio A2A agent with an ERC-8183 vault-report job, the keeper loop in the same process, ERC-8004 identity on BSC mainnet. Hosting later moved to a container host (see DX_LOG.md).

