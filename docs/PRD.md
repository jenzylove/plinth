# Plinth: PRD

**One line.** Get your money back at 12 months, plus US stock upside.

**Hack.** BNB Hack: Tokenized Stocks Edition. Deadline 2026-10-11 12:00 UTC. BSC mainnet, spot only.

---

## 1. Problem

People outside the US who hold stablecoins want the upside of US stocks, but they cannot stomach losing their savings.

In banks this is solved by the capital-protected note, or structured deposit. It is one of the most sold retail products in Asia. The structured deposit market was about $1.25T in 2024. Structured Retail Products reports capital protection taking over in Korea and Hong Kong in 2026, and Singapore private banks concentrating on US tech and AI themes.

On-chain, this product does not exist for equities. We checked live products, CEX earn products and every public repo from this hack we could find:
- Bitget Shark Fin: principal-protected, but BTC and ETH only, custodial and locked.
- Kraken xStocks vaults (Sep 14, 2026): yield on stock tokens you already hold, no protection.
- 20+ public hack repos: arbitrage, routing, DCA, rebalancing, baskets and gates. None protects capital.

Banks run this product with CPPI, a method desks have used for about 40 years. Its classic weakness is the overnight gap: the market shuts, the stock opens far lower, and the desk cannot sell in between. Over 10 years, Nvidia gapped down overnight by 10% or more five times, and once by 19.3% (2018-11-16).

bStocks trade 24/7 on BSC, and they do move while NYSE is shut: in their first months, META fell 11% and SanDisk 20% before the next open, with real volume (about $300k an hour in NVDA's bStock on a Sunday). Plinth can rebalance at 3am on a Sunday, which no bank desk can do.

The same 24/7 pools also print bad ticks: SPY at $1,086 against $750 for an hour, QQQ at -31% for a minute. A vault that trades at the last print would buy the spike and sell the hole. Plinth values the stock at the lower of a 10-minute and a 60-second pool average: falls count within a minute, spikes and one-minute holes do not. On three months of real hourly bStock prices, a naive always-on vault broke the floor on SPY and SanDisk; Plinth's rule broke it on neither (`data/always-on-2026-10-04.json`).

What the data says, plainly: most of the protection on a known event comes from cutting risk before it (Nvidia 2018 replay: a bank desk at a fixed multiplier was $0.87 above the floor at the gap, a desk making Plinth's cuts $4.95, Plinth $6.26). Trading around the clock adds the rest and costs about nothing in calm months (19 stocks, three months: average end value +$0.56 against a desk that trades only in NYSE hours). It is insurance for the drops that happen while New York sleeps, not a return engine.

## 2. User and front door

**User.** A non-US saver with $100 to $10,000 in stablecoins who has never bought a stock, or who buys structured deposits at a bank.

**First ten seconds.** One screen, no wallet needed to look:

- Pick a stock: Nvidia, Apple, Nasdaq-100, S&P 500 and 15 more.
- Pick a floor. The default is "Get my money back" (100%). 95% and 90% give more exposure.
- The screen answers live, from today's pool rates and the stock's own history:
  - "$139 of your $1,000 starts working in Nvidia. It grows as Nvidia rises."
  - "If Nvidia falls, Plinth moves your money to safety on its own. At 12 months you get at least $1,000."
  - "Leave early any time. If you left today, the worst case would be $972."
  - "Tested on every 12-month window of the last 10 years: never below $1,000. Typical result $1,065. Best $2,361. Beat plain lending 59% of the time."
- One button: Deposit.

## 3. Full scope (ships as one build)

### 3.1 Vault contract (one per saver, BSC mainnet)
- Holds the saver's USDT. Splits it into a safe leg and a stock leg.
- CPPI rules enforced in the contract:
  - floor value = promise ÷ (1 + r)^(time left)
  - stock target = min(total value, multiplier × (total value − floor value))
- Rebalance bands: trade only when the stock leg drifts more than 10% from target.
- Withdraw any time: the saver receives today's value.
- At maturity: pay out, or roll into a new term at the new value.
- Keeper role can call `rebalance()`, cut the multiplier at once, raise it back at most +1 per four hours, and move the safe leg between the factory's fixed markets. It can never withdraw, raise the multiplier above the stock's cap, or send funds anywhere except the saver.
- Price: the lower of a slow reference (Venus's feed, or the pool's 10-minute TWAP) and the pool's 60-second TWAP. Falls count within a minute so crash sells fill; spikes must last ten minutes before they count, so the vault never chases them.
- Swaps through PancakeSwap v3 or Uniswap v3 on BSC, refusing any fill worse than that price minus a maximum slippage (1% or 1.5% by pool fee).
- One trade is at most $10k (every listed stock sells $10k for at most 1.3%); bigger moves take several calls. A vault takes at most $50k, so a full de-risk is five trades.
- Owner changes that add risk (a new keeper, a cap raised back up) wait one day in public; removing the keeper or lowering a cap is instant. Smallest first deposit $1.
- If no lending market passes the gate, the floor keeps the last healthy rate for 7 days (at most 0.07% of the promise in lost interest) before treating plain USDT as earning nothing, so one bad hour does not sell the stock leg at the worst moment.

### 3.2 Safe leg: always earning, behind a health gate
- Eligible: Venus core pool and Aave v3 stablecoin markets only. No CeDeFi, no synthetic dollars, no borrowing, no loops.
- Before every rebalance, the health gate checks:
  - withdrawable cash at least 20× our position
  - utilization at most 92%
  - market not paused
  - price feed fresh
- If a pool fails, the vault pulls out first and reports second. If no pool passes, funds wait in USDT.
- Rotation to a better pool only when the rate gain beats gas and the new pool passes the gate.
- The floor counts interest at the current rate, and the health gate protects the principal.

### 3.3 Stock universe and multiplier (computed, not set)
- Universe: the 68 bStocks on BSC, filtered daily to those where a $10k sale costs at most 1% on-chain. 19 pass today.
- Multiplier per stock: the highest value that never broke the floor over 10 years of real daily prices, capped at 6. Stocks with less than 2 years of history get 3.
- Example (today's calibration run): Tesla at 5.4 broke the floor in 8 windows; at 4 it broke in 0. So Tesla runs at 4.

### 3.4 Keeper agent on BNB Agent Studio
- Runs 24/7, checks every vault every minute, and calls `rebalance()` when bands are crossed, repeating while a big move needs more than one trade (each trade is at most the stock's `maxTrade`).
- Cuts the multiplier at once; raises it back one step (+1) per four hours, which is all the contract allows. A stolen keeper key therefore cannot churn a vault through sell-then-buy round trips.
- AI job: event risk. It reads earnings dates, Web3 API pause and status codes, and scheduled macro releases, then lowers the multiplier before them and restores it after, never above the cap.
- Has an ERC-8004 on-chain identity. Every action is a signed, public log entry.
- Pays its own LLM and data costs through x402.
- Exposes an ERC-8183 task interface for "open a Plinth vault" jobs.

### 3.5 Agentic Wallet rail
- Deposit and withdraw from the saver's Binance Agentic Wallet through developer mode `contract-call` (preview, then execute).
- Positions do not live in the Agentic Wallet. Sessions expire after at most 48h, and risk control can block crash sells. This is written down, not hidden.

### 3.6 App
- Front door (section 2), live vault page, `/demo` (no wallet), `/proof`.
- Vault page shows:
  - value now
  - the floor
  - break distance (the single drop that would breach the promise today)
  - worst-case exit today
  - safe leg pool and its health
  - every trade with a BscScan link
  - the agent's log
- Dark and light themes. Works on a phone.

### 3.7 Proof
- `/proof`:
  - the 10-year backtest per stock (every 12-month window): min, median, max, breaches and how often it beat plain lending
  - the multiplier calibration
  - the first misses found
- A replay lab: real Plinth contracts on a fork of BSC mainnet, replaying Nvidia's −19.3% day (2018-11-16) and the July 2026 week. A bank-desk version (daily, multiplier 5) is shown next to Plinth. Clearly marked replay.
- Live mainnet vaults with real deposits and withdrawals.

### Cut, and why
- Custom baskets: scope. Single stocks and the SPY and QQQ ETFs cover it.
- Ondo and xStocks tokens: almost no on-chain pool depth, and RFQ needs a normal wallet signer, not a contract.
- A promise of $1,000 at any moment: leaves almost nothing for stocks.
- Ratchet (floor rises with gains): only if time allows after everything above is done.

## 4. How each judging criterion is met

| Criterion | How Plinth meets it |
|---|---|
| Technical implementation (30) | Contract-enforced CPPI, health-gated safe leg, per-stock multiplier from 10y data, 24/7 keeper, mainnet vaults, fork replays |
| Creativity and originality (25) | Not on the organizers' idea list. The first capital-protected equity product on-chain. Uses 24/7 trading to defend the floor while New York sleeps, with a price rule built from the bStock pools' own bad prints |
| Developer Experience Report (25) | Written by the user. The build log captures raw facts for it (see section 7) |
| Product quality and UX (20) | One question: "get your money back?" Aimed at bank structured-deposit buyers, the least crypto-native users |

Sponsor tech:

| Tech | Use |
|---|---|
| bStocks | The stock leg, central |
| Binance Web3 API | RWA Data for reference price, status, pause codes and multipliers; DeFi API for ranking the safe leg; Trading API for quotes; Transaction API to simulate before firing |
| Agent Studio | The keeper, with ERC-8004 identity, x402 self-funding and ERC-8183 tasks |
| Agentic Wallet | Deposit and withdraw rail |
| BSC mainnet | Everything |

## 5. Claims and how each is proven

| Claim | Proof |
|---|---|
| Never ended below the floor over 10 years of real prices, for each listed stock | `/proof` backtest, code in repo, anyone can rerun |
| Plinth defends at hours a bank desk cannot | Agent log timestamps on mainnet outside NYSE hours; `data/closed-hours-*.json` (bStock falls while NYSE was shut, from the Web3 API) |
| The price rule survives bStock bad prints | `data/always-on-*.json`: naive always-on vs Plinth's rule vs a desk on three months of real hourly prices |
| A crash sell fills within about a minute | Fork tests `test_crashSellsTowardSafety` and, for contrast, `test_v1Rule_slowPriceAloneCannotSellInACrash` |
| A stolen keeper key cannot churn a vault | Fork test `test_stolenKeeperCannotChurnTheVault` |
| The promise is enforced by code, not by us | Contract source; keeper role cannot withdraw (test plus a failed mainnet attempt shown) |
| Safe leg pulls out when unhealthy | Unit tests plus a fork replay of a pool hitting 95% utilization |
| Live numbers on the front door | Read from chain and APIs at view time, never hardcoded |

## 6. What it does not do
- It is not guaranteed. The named risks are:
  - the lending pool
  - our contract
  - the stablecoin's peg
  - a move bigger than any in 10 years, faster than the keeper can act
- Early exit returns today's value, not the promise.
- No leverage, no perps, no borrowing.
- Not for US persons or other excluded regions.

## 7. Developer Experience Report inputs (raw facts to log while building)
Onboarding time for each API, doc gaps, RFQ versus contract signing, Agentic Wallet sessions and developer mode, BEP-677 multipliers, pool depth per bStock, and pause behaviour. The user writes the report; we only log the facts.

## 8. Sponsor checklist
See `SUBMISSION_CHECKLIST.md`.
