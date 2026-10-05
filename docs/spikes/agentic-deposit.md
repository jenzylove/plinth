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

## v2: withdraw, deposit and withdraw again (2026-10-04, BSC mainnet)

All from the same Agentic Wallet 0x79B2FC7d94b621C464DC8996d83B19F43613e2Fd with `baw` 1.10, each a Developer Mode `contract-call preview` (Binance simulation with exact balance and allowance changes, no risk flags) then `execute`.

| Step | Call | Simulated change | Tx |
|---|---|---|---|
| 1 | v1 vault `withdraw(1e18)` (leave everything) | +10.0438 USDT | [0x797a2ff4…dc5d](https://bscscan.com/tx/0x797a2ff49e6c856634d33512e23b81ea92aeacb252fbd3c1b2483229b805dc5d) |
| 2 | USDT `approve(v2 factory, 11e18)` | allowance 0 → 11 | [0xd3e4bc7b…af8e](https://bscscan.com/tx/0xd3e4bc7b4c65a370b89240231fcc317602359683ad6cb970b94a676789c4af8e) |
| 3 | v2 factory `open(12 /*NVDA*/, 9000 /*90% floor*/, 11e18)` | -11 USDT | [0xfd9dd73d…81e1](https://bscscan.com/tx/0xfd9dd73d01028b8b7ecb76d6c75a87199516573fec5ee2d49db13db68b9581e1) |
| 4 | v2 vault `withdraw(0.25e18)` | +2.7480 USDT | [0x56dbeb08…dcb9](https://bscscan.com/tx/0x56dbeb086b38fe1e3645b18b1a167aa9f6721bae3e87f17e2cbfbf06adc5dcb9) |

v2 vault [0x18B9c043e7D4a17c1a034e97C826984dEb1cadFb](https://bscscan.com/address/0x18B9c043e7D4a17c1a034e97C826984dEb1cadFb), right after opening: value $10.99, $8.07 in NVDAB, $2.93 in Venus at 3.30%, floor $9.58, break distance 17.5%, multiplier 5.7. After the 25% withdrawal: $8.25, $6.05 in NVDAB. It is the site's live demo vault; at the 90% floor a 5.7 to 4.2 risk cut sells about $1.60 of stock, above the $1 minimum trade, so the keeper's cuts trade on chain.

## Migration to v3 (2026-10-05)

| Step | Call | Tx |
|---|---|---|
| 1 | v2 vault `withdraw(1e18)` (+8.26 USDT) | [0x3f33b00d…9ba6](https://bscscan.com/tx/0x3f33b00d312500388f30825c37bf12e9e120a9522ecb5e0843afa602241e9ba6) |
| 2 | USDT `approve(v3 factory, 11e18)` | [0xb6eaf80e…dd34](https://bscscan.com/tx/0xb6eaf80e537bd17e6529a7d96db2bc9096c8b67877ce15c18fd6077d5919dd34) |
| 3 | v3 factory `open(12 /*NVDA*/, 9000, 11e18)` | [0x376fe779…6f](https://bscscan.com/tx/0x376fe77921c6cb2ebfa199b3be62456a9512691b38baed9b1c164287d0ab2b6f) |

v3 vault [0xF0FB407210944A577949eA7Cc3031B542740B5B2](https://bscscan.com/address/0xF0FB407210944A577949eA7Cc3031B542740B5B2) right after opening: $10.996, $8.09 in NVDAB, $2.91 in Venus, floor $9.58, break distance 17.5%.
