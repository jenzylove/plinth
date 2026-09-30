# Spike S2: Binance Web3 API through a non-US relay

**Question.** What does the Web3 API return for bStock prices, status and market data, and can our backend reach it?

**What was run.** First from this container (US IP): every RWA endpoint returned HTTP 200 with code 40304 "compliance restriction". Then through `relay/` deployed on Vercel region sin1 (https://plinth-relay.vercel.app), which signs with keys held in Vercel's encrypted env and forwards read-only GETs.

**Output (2026-09-30, through the relay).**
- `/api/health`: `{"ok":true,"region":"sin1","keyConfigured":true}`
- `rwa/platforms`: code 0. bstock: 87 tickers, all on chain 56. ondo: 459 tickers.
- `rwa/price` NVDAB + QQQB: code 0. NVDAB tokenPrice 230.67, referencePrice 230.490627. QQQB 743.05 / 742.511799. Upstream 92 ms.
- `rwa/underlying-market` NVDAB: code 0. statusInfo `openState:true, reasonCode:"TRADING"`, 52w high 236.54, low 164.27, dividendYield 0.0012.
- A path outside the read-only allowlist (`/api/v1/dex/trade/swap`) is refused by the relay with 400.

**Verdict.** Pass. Our backend and keeper call the Web3 API through the sin1 relay. `statusInfo.reasonCode` gives the trading status the keeper needs for pause handling; `referencePrice` gives a second price to cross-check the vault's reference price.
