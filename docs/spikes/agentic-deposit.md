# Spike S1: Agentic Wallet deposit through a Developer Mode contract-call

**Question.** Can a saver's Binance Agentic Wallet open and fund a Plinth vault with Developer Mode `contract-call`?

**What was run (2026-09-30, BSC mainnet).** From Agentic Wallet 0x79B2FC7d94b621C464DC8996d83B19F43613e2Fd with `baw` 1.10:
1. `contract-call preview` then `execute`: USDT `approve(factory, 10e18)`. Tx [0xe1192faa…0069](https://bscscan.com/tx/0xe1192faa174b78b82cccc4ef306fb4f7aa4e57b06a98cf1dfbc0c35075000069).
2. `contract-call preview` then `execute`: `PlinthFactory.open(12 /*NVDA*/, 10000 /*100% floor*/, 10e18)`. Tx [0x35cd29e9…e1c1](https://bscscan.com/tx/0x35cd29e94eab115f230541190f26d6610578d04b2a01f0f68476e4ca8961e1c1).

**Output.** Vault [0x7285CF07Cb75C4FC5065eC3a72a3ec52A5f12095](https://bscscan.com/address/0x7285CF07Cb75C4FC5065eC3a72a3ec52A5f12095), read from `status()` right after:

| Field | Value |
|---|---|
| Value | $9.9927 |
| Stock leg (NVDAB) | $1.7887 (target $1.7543, multiplier 5.7) |
| Safe leg | $8.2039 in Venus vUSDT (market 1), gate healthy |
| Floor today | $9.6849 at a 3.25% floor rate |
| Promise | $10.00 on 2027-09-30 |
| Break distance | 17.2% |

**Verdict.** Pass. The Agentic Wallet is a working deposit rail: two previewed contract-calls, simulation showed the exact balance and allowance changes, no risk flags, and the vault bought NVDAB and lent the rest to Venus in the same transaction.
