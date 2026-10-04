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

## 2026-09-30 Agent Studio first look
- `npm i -g @bnbagent/studio-cli` installs `bag` 0.0.14 cleanly. The website says the CLI is `bnb`; the binary is `bag`.
- The website FAQ points to docs.bnbchain.org/developer-kit/bnbchain-studio/; the deployment page does not state prices, mainnet support per provider, or whether agents can run scheduled work.
- The managed and Azure options are 48-hour testnet trials. Running on BSC mainnet needs AWS (own account) or NodeOps (pay from the agent wallet).
- The most detailed provider docs ship inside the npm package (`skills/references/*.md`), not on the website.
- Studio's model is a request-driven seller agent. A keeper that must act on a schedule has no first-class path; it has to run its own loop inside the served process.
- `bag init --network bsc-mainnet --destination self --protocols A2A --rails 8183 --seller-price-usd 0` scaffolds 2,527 lines of TypeScript in 10 files plus a 271 MB workspace. The project name must be alphanumeric, 23 chars max, no dashes.
- The wallet interface exposes `signTransaction` for a legacy tx, which is enough for a keeper to sign its own contract calls in fixed code.
- `bag llm activate` (SIWE with the agent wallet, free `auto/free` model, $0 allocation) worked first try in under 10 s.
- `bag deploy prepare --provider nodeops` flags 3 CRITICALs on a fresh mainnet scaffold: Pieverse key missing (fixed by `bag llm activate`), and `storage.kind = local` not deployable (needs an IPFS, S3 or Azure Blob write key from the user).
- `bag deploy wallet` (no `--provider` flag, unlike its sibling subcommands) lists the gateway's accepted payment assets: USDC on BSC (18 decimals), Base and Arbitrum. It says "Gateway does not expose independent CreateOS credit balance or renewal APIs". The hosting price is only known from the payment challenge at deploy time.
- 2026-09-30: `forge verify-contract --chain 56` with an Etherscan V2 key fails: "Free API access is not supported for this chain. Please upgrade your api plan". The legacy `api.bscscan.com/api` endpoint now returns the Etherscan docs page instead of an API response. Both contracts already show `exact_match` (creation and runtime) on Sourcify, which needs no key.
- 2026-09-30: `bag wallet new --generate-password` refuses when studio.toml still holds an old `[wallet].address` ("refusing to generate a replacement password for an existing or anchored evm-local wallet"), even when the keystore file is gone. Clearing the address line lets it create a fresh wallet.
- 2026-09-30: `bag env set KEY -` does not read stdin; it stores a literal "-". Secret values have to go into `.studio/.env.local` another way to stay out of argv.
- 2026-09-30: `bag llm activate` in a fresh container fails when studio.toml has a `key_hash` but `.env.local` lacks PIEVERSE_LLM_API_KEY. `bag llm rotate` fixes it but reports "old key disable: FAILED — manual cleanup required".
- 2026-09-30: `bag deploy prepare` with `storage.kind = ipfs` needs STORAGE_API_URL too (CRITICAL otherwise). Pinata: `https://api.pinata.cloud/pinning/pinJSONToIPFS` with the JWT as STORAGE_API_KEY.
- 2026-09-30: `bag deploy --provider nodeops --pay` (studio-cli 0.0.14) fails with "Invalid or unsupported Gateway payment challenge." The catch block in `deploy-provider-nodeops/src/payment/offer.ts` swallows the real reason: the gateway's x402 `resource.url` is `http://mpp-createos.nodeops.network/agent/deploy`, while the CLI only trusts the `https://` origin. Worked around by patching the installed `dist/sdk.js` to accept the http form of the same URL.
- 2026-09-30: NodeOps quoted 1.813947 USDC (18-decimal BSC USDC, `1813947067621152209`) for one month of wallet-mode hosting. Spender was the CLI's curated B402 Permit2 proxy `0x3038f7ac…8633`, payTo `0x04a3D3F1…C39D`.
- 2026-09-30: The CLI sends the USDC -> Permit2 approval (exact amount) before signing, then the wallet's default SigningPolicy rejects the payment: "primary type 'PermitWitnessTransferFrom' not in allowlist". So every BSC wallet-mode deploy fails on a fresh project unless `[wallet.signing] extra_domains = [[56, "0x000000000022D473030F116dDEE9F6B43aC78BA3"]]` and `extra_primary_types = ["PermitWitnessTransferFrom"]` are set. The docs don't mention it; found by reading `buildPolicy` in studio-runtime.
- 2026-09-30: After paying, `bag deploy` exited with "Deployment <id> still pending. Use status; no new payment is needed." Gateway (wallet) mode has no logs: "Gateway does not expose logs. Use account mode if runtime logs are required."
- 2026-09-30: The NodeOps zip deploy bundles the agent into one `unifiedMain.js` and a generated Dockerfile (`FROM node:22-bookworm-slim`, `CMD ["node", entrypoint]`), with no install step and no other files. Code that reads data files next to itself (`new URL('../data/', import.meta.url)`) crash-loops on start, and the gateway only ever reports "Deployment in progress" (no logs in wallet mode). Found by capturing the zip and running it locally. Fix: import the JSON so the bundler inlines it.
- 2026-09-30: Wallet-mode deployments cannot be updated: a second `bag deploy` fails with "Gateway update is unavailable. Existing wallet project remains active; use status." A fix means deleting the project and paying again.
- 2026-10-01: Foundry with `via_ir = true`: `uint256 t0 = block.timestamp;` followed by `vm.warp` makes later reads of `t0` return the warped time, so repeated `vm.warp(t0 + dt)` compounds. `vm.getBlockTimestamp()` fixes it. Cost an hour of wrong replay results.
- 2026-10-01: On a BSC fork, skipping hours ahead makes Venus's ResilientOracle treat USDT's feed as stale, which a health gate reads as a peg failure. Replays have to hold the feed price (mockCall) to test the market rather than the fork.
- 2026-10-01: `vercel deploy` from a subfolder silently connects the GitHub repo to the new project with no root directory. The next push to main built the repo root (no output) and replaced the working production site with a 404. Fix: set rootDirectory, framework, build and output in project settings. Promoting a preview deployment via API returned 422; creating a production deployment from a git ref worked.
- 2026-10-02: GitHub Actions `schedule: '*/5 * * * *'` is best effort. The keeper's first scheduled action ran 77 minutes after its window opened and the second 34 minutes late. Fine for 12-hour macro windows; too slow to promise minute-level reactions.
- 2026-10-03: Measured over 45 hours, GitHub's `*/5` schedule ran the keeper 10 times, 2.5 to 5.5 hours apart, not every 5 minutes. A scheduled workflow cannot be the keeper for a product that promises to react within minutes.
- 2026-10-04: Free BSC archive state for fork tests: `bsc-mainnet.public.blastapi.io` answers historical `eth_call` without a key. publicnode refuses archive reads ("personal token"), drpc and 1rpc rate-limit at once, ankr and nodies need a key, meowrpc does not support `eth_call`.
- 2026-10-04: All 20 listed bStock pools (PancakeSwap v3 and Uniswap v3) keep enough observations for a 60-second and a 10-minute TWAP (cardinality 300 to 10,000). NVDA's 300 observations do not reach 24 hours back.
- 2026-10-04: Venus's ResilientOracle prices NVDA, SKHY, SPCX and TSLA bStocks on a Sunday within 0.1% of the pool's 60-second TWAP (NVDA oracle 234.98 vs pool 235.10). The feed keeps moving when NYSE is shut. Main and pivot oracles: 0x9E69...41D0 and 0x0448...cF91.
- 2026-10-04: A 10-minute TWAP as the reference for a protective sell blocks the sell in a crash. On a fork, QQQB fell 10.2% in one block; 90 seconds later the vault still valued QQQB near the old price and every sell failed its slippage check against the stale TWAP. Taking the lower of the 10-minute and a 60-second TWAP let the same sell fill (fork tests `test_v1Rule_slowPriceAloneCannotSellInACrash` and `test_crashSellsTowardSafety`).
- 2026-10-04: Same `via_ir` trap as 2026-10-01, this time with `vm.roll(block.number + n)` in a loop: `block.number` is read once, so the block number went backwards and Venus's `accrueInterest` reverted with a bare "math error". `vm.getBlockNumber()` fixes it.
- 2026-10-04: Web3 API price history for bStocks: `/api/v1/dex/market/rwa/kline` (bars 1m, 5m, 15m, 1h, 4h, 12h, 1d; at most 300 per call, a higher `limit` returns 40001 "invalid limit range"; page back with `endTime`, other names such as `to`, `before`, `after`, `startTime` are silently ignored and return the latest 300). `/api/v1/dex/market/candles` also answers (more bar sizes, includes volume and trade count) but ignored every paging parameter we tried. `/api/v1/dex/market/price` and `price-info` answer "Request method 'GET' not supported". Bar format differs between the two: kline is `[openTime, o, h, l, c, null, closeTime]` with string prices, candles is `[o, h, l, c, volume, openTime, trades]` with numbers.
- 2026-10-04: History starts at each bStock's listing: 2026-06-12 for NVDA, SNDK, SPCX, TSLA, CRCL; mid July to mid August for the rest. 1,051 to 2,719 hourly bars each.
- 2026-10-04: bStock prices carry short bad prints in both directions: SPY 1,086 against ~750 (2026-08-03 08:00 UTC), SNDK 8,221 against ~1,565 (2026-09-15 11:00), META's first bar 5,228 against ~650, QQQ a one-minute low at -31% (2026-09-09 11:30), SPCX a one-minute low at -14%. MSTR shows 8 one-minute bars at -94% on 2026-06-27. A consumer that trades at the last print would buy the spikes and sell the holes.
- 2026-10-04: NVDA's bStock traded about $300k an hour on a Sunday afternoon (candles volume), so the pools are live while NYSE is shut.
- 2026-10-04: The only complete endpoint list we found for the Web3 API is the source of the official Python SDK (`pip download binance-web3-wallet`, v8.0.0, `rest_api/api/*.py`). Its docstrings link to web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/. Guessing paths cost time: DeFi data lives at `/api/v1/defi/data/...`, not under `/api/v1/dex/defi/`, so our relay's original `/api/v1/dex/defi/` allowlist could never match a real endpoint (every guess returned 404 "No static resource").
- 2026-10-04: POST signing works as `base64(HMAC_SHA256(secret, timestamp + "POST" + "/build" + path + jsonBody))`, the same scheme as GET with the body appended. Confirmed on `/api/v1/defi/data/investment/list` and `/api/v1/dex/pre-transaction/simulate`.
- 2026-10-04: `defi/data/investment/list` with `investType: "Earn"`, BSC and USDT returns 8 products: Venus 3.33% ($181M TVL), Aave V3 3.00% ($65.5M), Plume 10.77% ($32.5M) and five more. `tokenAddressList` requires `binanceChainId` or it returns 40001.
- 2026-10-04: `dex/aggregator/quote` for 1 NVDAB to USDT answered from vendor LiquidMesh in execution mode SWAP, with price impact and trade fee. The SDK docs say RFQ routes for bStocks need `userWalletAddress` and a wallet signature at swap time, which a vault contract cannot give; quotes are still useful to price an exit.
- 2026-10-04: `dex/pre-transaction/simulate` returns `{status, failReason, balanceChanges, allowanceChanges}`; a no-op `rebalance()` on our v1 vault came back SUCCESS with empty changes. The SDK marks `evmTx`, `solTx` and `tronTx` all required "for rendering purposes only"; sending just `evmTx` works.
- 2026-10-04: Vercel "Secret" env vars cannot be pulled (`vercel env pull` writes empty values), so local scripts cannot sign Web3 API calls; everything goes through the deployed relay.
- 2026-10-04: NodeOps wallet-mode projects belong to the wallet that paid. The cloud session's agent wallet (0xAd14...0603) kept its keystore only inside that container; with the container gone, project 970f7134 (1.81 USDC, stuck "deploying") and the wallet's remaining 6.42 USDC cannot be reached. A fresh agent wallet now lives on the user's machine.
- 2026-10-04: A fresh `npm i -g @bnbagent/studio-cli@0.0.14` still rejects the NodeOps x402 challenge ("Invalid or unsupported Gateway payment challenge"): line 2058 of `deploy-provider-nodeops/dist/sdk.js` compares `resource.url` with the https origin while the gateway sends `http://mpp-createos.nodeops.network/agent/deploy`. Patched locally again. `bag wallet new --generate-password` refuses while studio.toml still names an old address, and `bag llm activate` refuses while an old `key_hash` is present without its key; both needed manual edits of studio.toml.
- 2026-10-04: v2 deploy on BSC mainnet: 22 transactions (factory with the vault implementation inside, 20 `addStock`, `transferOwnership`), 12.9M gas estimated, 0.00048 BNB paid at 0.05 gwei. Sourcify verification for both contracts returned `exact_match` within a minute (`forge verify-contract --verifier sourcify`, `--guess-constructor-args` for the factory).
- 2026-10-04: The Studio SDK's IPFS storage sends `Authorization: Bearer <STORAGE_API_KEY>`, so it needs Pinata's JWT. Pinata's 20-character API key fails with "token is malformed: token contains an invalid number of segments"; the docs and `bag doctor` only say "STORAGE_API_KEY", not which Pinata credential.
- 2026-10-04: Stopping `bag dev` on Windows leaves its `tsx` child running and holding the port; a new `bag dev` on the same port then serves nothing new while the old process keeps answering. Kill the listener by port.
- 2026-10-04: Agentic Wallet sign-in codes expire in 5 minutes (`[10001003] QR code expired`); the first one lapsed while the user was away from the phone. The second was approved and `baw` reported "Login successful! Wallet created" for the same wallet as before (0x79B2...e2Fd).
- 2026-10-04: Developer Mode `contract-call` worked first time for a full withdrawal, an approve, a vault open and a partial withdrawal. Every preview returned simulation code 000000000, exact balance changes for the wallet (e.g. +10.0438 USDT for the withdrawal, -11 USDT for the open), allowance changes for the approve, and an empty risk list. Each execute returned BROADCASTED with a tx hash at once; receipts landed within seconds.
