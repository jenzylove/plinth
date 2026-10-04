# Deployments (BSC mainnet, chain 56)

## v2 (live, 2026-10-04)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906](https://bscscan.com/address/0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906) | [Sourcify exact match](https://repo.sourcify.dev/56/0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906) |
| PlinthVault (implementation, cloned per saver) | [0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939](https://bscscan.com/address/0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939) | [Sourcify exact match](https://repo.sourcify.dev/56/0x0C6f98E3235C74c84f2b0A509914D3F49e3f8939) |

- Deployed from block 125,630,448. First tx: [0x7d1d7c14…6cd9](https://bscscan.com/tx/0x7d1d7c14b34c40cbf178e76bcba4e391560da550b8aa0eeaf1b4c03f74626cd9). 22 transactions (factory, 20 `addStock`, `transferOwnership`), 0.00048 BNB in gas.
- Deployer 0x1Bc8751CEe3CCA2f65cd624E7925558aA6f9af34; owner handed to 0x14D539F08edf09FBf152e2ba5B461A3522B30849 (Ownable2Step: takes effect when it calls `acceptOwnership()`).
- Keeper: the Agent Studio agent 0xB12a1e4e0E22A97E266eD7a6bfc4133F699b1A1b. The GitHub Actions wallet 0x3aCd…2923 runs as a backup and makes only the calls anyone may make.
- Settings: max floor rate 6%, term 365 days, minimum trade $1, minimum first deposit $1, per stock: fast window 60 s, one trade at most $10k, one vault at most $50k.

## v1 (2026-09-30, superseded)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x57AB13A70d0BC7983196014b86D632eCAfD4b96f](https://bscscan.com/address/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) | [Sourcify exact match](https://repo.sourcify.dev/56/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) |
| PlinthVault (implementation, cloned per saver) | [0xa892e77dD7841Abb357Fd2E2faf254753C4eA255](https://bscscan.com/address/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) | [Sourcify exact match](https://repo.sourcify.dev/56/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) |

- Deployed 2026-09-30, from block 124,973,776. First tx: [0xf7616acd…7a9a](https://bscscan.com/tx/0xf7616acd2feb82409e78d48a2e6073ffe587864d9b96898ae0b64855e6ef7a9a). 21 transactions (factory + 20 `addStock`), 0.00042 BNB in gas.
- Owner and keeper: deployer 0x14D539F08edf09FBf152e2ba5B461A3522B30849. The keeper moves to the Agent Studio keeper with `setKeeper`.
- Stocks: `data/stocks.json` (20 bStocks, caps from `data/calibration-2026-09-30.json`). Full transaction list: `contracts/broadcast/Deploy.s.sol/56/run-latest.json`.
