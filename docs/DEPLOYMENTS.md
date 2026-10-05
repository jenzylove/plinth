# Deployments (BSC mainnet, chain 56)

## v3 (live, 2026-10-05)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x271cb3B56E133cd3488AB31e99766A288bC8DCe5](https://bscscan.com/address/0x271cb3B56E133cd3488AB31e99766A288bC8DCe5) | [Sourcify exact match](https://repo.sourcify.dev/56/0x271cb3B56E133cd3488AB31e99766A288bC8DCe5) |
| PlinthVault (implementation) | [0xcCE5d6ADAC4869fd9ee282Dbe085e2aDbCC197dB](https://bscscan.com/address/0xcCE5d6ADAC4869fd9ee282Dbe085e2aDbCC197dB) | [Sourcify exact match](https://repo.sourcify.dev/56/0xcCE5d6ADAC4869fd9ee282Dbe085e2aDbCC197dB) |

- Deployed from block 125,831,062. First tx [0x2013ec24…fb52](https://bscscan.com/tx/0x2013ec242e6cc84571b05b7b409cc105b16680136171c4596f9ce1898df4fb52). 22 transactions.
- Fixes from the second audit: a refused supply keeps tracking the existing position (H1); a market that will not redeem leaves the vault sell-only instead of blocking sells (H2); targets use min(multiplier, cap) (H5); transfers above the principal cap are held aside (M1); staged exit (M2); `Traded` events with executed amounts (M6); the live pool price must confirm a fall (M5). Regressions: `contracts/test/AuditFixes.t.sol`.
- Keeper: the Agent Studio agent 0xB12a…1A1b, hosted on Railway (https://keeper-production-b362.up.railway.app, public at https://plinth-relay.vercel.app/agent). Owner: 0x14D539F08edf09FBf152e2ba5B461A3522B30849 (accepted 2026-10-05).
- Demo vault [0xF0FB407210944A577949eA7Cc3031B542740B5B2](https://bscscan.com/address/0xF0FB407210944A577949eA7Cc3031B542740B5B2) (Agentic Wallet saver, NVDA, 90% floor), migrated from v2.

## v2 (2026-10-04, superseded)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906](https://bscscan.com/address/0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906) | [Sourcify exact match](https://repo.sourcify.dev/56/0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906) |
| PlinthVault (implementation, cloned per saver) | [0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939](https://bscscan.com/address/0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939) | [Sourcify exact match](https://repo.sourcify.dev/56/0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939) |

- Deployed from block 125,630,448. First tx: [0x7d1d7c14…6cd9](https://bscscan.com/tx/0x7d1d7c14b34c40cbf178e76bcba4e391560da550b8aa0eeaf1b4c03f74626cd9). 22 transactions (factory, 20 `addStock`, `transferOwnership`), 0.00048 BNB in gas.
- Deployer 0x1Bc8751CEe3CCA2f65cd624E7925558aA6f9af34; owner handed to 0x14D539F08edf09FBf152e2ba5B461A3522B30849 (Ownable2Step: takes effect when it calls `acceptOwnership()`).
- Keeper: the Agent Studio agent 0xB12a1e4e0E22A97E266eD7a6bfc4133F699b1A1b.
- Settings: max floor rate 6%, term 365 days, minimum trade $1, minimum first deposit $1, per stock: fast window 60 s, one trade at most $10k, one vault at most $50k.

## v1 (2026-09-30, superseded)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x57AB13A70d0BC7983196014b86D632eCAfD4b96f](https://bscscan.com/address/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) | [Sourcify exact match](https://repo.sourcify.dev/56/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) |
| PlinthVault (implementation, cloned per saver) | [0xa892e77dD7841Abb357Fd2E2faf254753C4eA255](https://bscscan.com/address/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) | [Sourcify exact match](https://repo.sourcify.dev/56/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) |

- Deployed 2026-09-30, from block 124,973,776. First tx: [0xf7616acd…7a9a](https://bscscan.com/tx/0xf7616acd2feb82409e78d48a2e6073ffe587864d9b96898ae0b64855e6ef7a9a). 21 transactions (factory + 20 `addStock`), 0.00042 BNB in gas.
- Owner and keeper: deployer 0x14D539F08edf09FBf152e2ba5B461A3522B30849. The keeper moves to the Agent Studio keeper with `setKeeper`.
- Stocks: `data/stocks.json` (20 bStocks, caps from `data/calibration-2026-09-30.json`). Full transaction list: `contracts/broadcast/Deploy.s.sol/56/run-latest.json`.
