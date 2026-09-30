# Deployments (BSC mainnet, chain 56)

| Contract | Address | Source |
|---|---|---|
| PlinthFactory | [0x57AB13A70d0BC7983196014b86D632eCAfD4b96f](https://bscscan.com/address/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) | [Sourcify exact match](https://repo.sourcify.dev/56/0x57AB13A70d0BC7983196014b86D632eCAfD4b96f) |
| PlinthVault (implementation, cloned per saver) | [0xa892e77dD7841Abb357Fd2E2faf254753C4eA255](https://bscscan.com/address/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) | [Sourcify exact match](https://repo.sourcify.dev/56/0xa892e77dD7841Abb357Fd2E2faf254753C4eA255) |

- Deployed 2026-09-30, from block 124,973,776. First tx: [0xf7616acd…7a9a](https://bscscan.com/tx/0xf7616acd2feb82409e78d48a2e6073ffe587864d9b96898ae0b64855e6ef7a9a). 21 transactions (factory + 20 `addStock`), 0.00042 BNB in gas.
- Owner and keeper: deployer 0x14D539F08edf09FBf152e2ba5B461A3522B30849. The keeper moves to the Agent Studio keeper with `setKeeper`.
- Stocks: `data/stocks.json` (20 bStocks, caps from `data/calibration-2026-09-30.json`). Full transaction list: `contracts/broadcast/Deploy.s.sol/56/run-latest.json`.
