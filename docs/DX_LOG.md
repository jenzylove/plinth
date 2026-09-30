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
