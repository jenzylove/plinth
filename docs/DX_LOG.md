# Developer experience log (raw facts for the user's report)

Facts only, with dates. The user writes the Developer Experience Report from these.

## 2026-09-30 Agentic Wallet onboarding
- Skill install: `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet` worked first time. `baw` CLI came from `npm i -g @binance/agentic-wallet` (v1.10.0).
- The docs page (install-agentic-wallet) says to open settings via "Settings icon (top right)" but that icon only exists inside the Binance mobile app after the first sign-in. The user looked for it on the docs site.
- Sign-in links expire after 5 minutes. Two links expired while the user was still setting up.
- In the app: an "app not updated" error while the Play Store app was already current.
- Scanning the code on desktop returned "create an Agentic Wallet first" only after the scan, not before.
- Wallet creation stuck at "Generating secure keys... 39%" on 4G mobile data.
- Sign-in asked for authenticator code plus email code; the pairing code is a separate visual match. Easy to confuse.
- Third link: signed in successfully.
- Defaults after creation: dailyLimit 50,000 USD, Developer Mode off, abnormalTxnHandling AutoReject, tradeAllTokens false, sessions 48h (signInMaxTime 7 days). A $50,000 default daily limit is high for a new AI-operated wallet.
- Same EVM address on BSC, Ethereum, Base, Arbitrum, Polygon, Robinhood Chain.

## 2026-09-30 Web3 API first call
- Signing per docs (ISO timestamp + METHOD + /build path + body, HMAC-SHA256, base64) was accepted: no 40102.
- Every RWA endpoint (platforms, price, underlying-market, underlying-profile) returned HTTP 200 with body code 40304 "Service not available due to compliance restriction" when called from a US cloud IP (Google Cloud, Columbus, Ohio).
- The error arrives as HTTP 200 with success:false, not a 4xx. Easy to miss in code that checks status only.
- Docs do not say the API is IP-geofenced, or which regions are allowed, or that server deployments must pick a non-US region.
- `baw` (Agentic Wallet CLI) sign-in, settings and address calls worked from the same US IP.

## 2026-09-30 Contracts on a BSC fork
- Venus's ResilientOracle (0x6592...ab8A) prices only 4 of the 21 liquid bStocks: NVDA, TSLA, SKHY, SPCX. The other 17 revert on getPrice. We use each pool's own time-weighted price (Uniswap/PancakeSwap v3 observe) for those.
- MRVL's PancakeSwap v3 pool has an observation cardinality of 1, so it has no TWAP until someone pays to raise it. Every other liquid bStock pool keeps 300 to 10,000 observations.
- bStock addresses in the official list are lowercase; Solidity rejects them until checksummed (QQQ, TSLA hit this).
- Venus vUSDT on BSC is still per-block (supplyRatePerBlock). There is no on-chain blocks-per-year getter we could call; we measured 0.4501 s per block over the last 1,000,000 blocks and set 70,064,000.
- Foundry from npm works; forge-std, OpenZeppelin and Solady clone fine as git submodules.
- A free NodeReal archive key made pinned-block fork tests reproducible (19 fork tests in under 2 minutes cold, under 1 s cached).

## 2026-09-30 Web3 API through a Singapore relay
- Deployed a 40-line Vercel function in region sin1 (hobby plan allows picking the region in vercel.json). Every RWA call that failed with 40304 from the US succeeded from sin1: platforms, price, underlying-market.
- Upstream latency from sin1: 92 to 194 ms.
- `rwa/platforms` now reports 87 bStock tickers on BSC; the official eligible list we used on the same day had 68.
- `rwa/price` returns both `tokenPrice` (on-chain token) and `referencePrice` (underlying), e.g. NVDAB 230.67 vs 230.490627.
- `underlying-market.statusInfo` gives openState and reasonCode ("TRADING"); marketStatus, nextOpenTime and nextCloseTime came back null for NVDAB during US hours.

## 2026-09-30 Agentic Wallet contract-call on mainnet
- New container, so the CLI session was gone: `baw wallet status` said UNCONNECTED even though the app session was still valid. Re-sign-in took one QR scan; `auth verify` returned SUCCESS in under 3 minutes.
- Settings after the user's setup: devMode enabled until 2026-10-07 (7 days), session 48h, dailyLimit 1000 (default was 50,000).
- `contract-call preview` decodes an ERC-20 approve fully (type Approve, spender, amount). For our own contract it shows only `ContractInteraction` and the 4-byte selector (0x3d57b2a9), not the function name or arguments, even though the source is verified on Sourcify.
- Simulation output was exact: USDT -10.000000 from the wallet, allowance 10 -> 0, no risk flags. Useful for showing the saver what they sign.
- A preview expires after about 2 minutes (expiresAt); a slow human confirmation needs a fresh preview.
- Both executes returned BROADCASTED with a tx hash within seconds; both confirmed.
