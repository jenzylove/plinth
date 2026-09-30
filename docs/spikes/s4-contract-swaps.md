# Spike S4: can a contract hold and trade each bStock?

**Question.** Plinth's vault is a contract. Can a contract address buy, hold and sell each liquid bStock through PancakeSwap v3 or Uniswap v3 on BSC, with no issuer restriction blocking it?

**What was run.** `spikes/s4-contract-swaps.cjs` on a local fork of BSC mainnet (anvil, forked from latest block, fresh fork per stock). A contract address was funded with USDT from a whale, bought $1,000 of each stock through its deepest pool, then sold it all back.

**Output (2026-09-30).**

| Stock | Pool | $1,000 round trip |
|---|---|---|
| NVDA | Uniswap v3 USDT 0.05% | $999.00 |
| QQQ, SPY | PancakeSwap v3 USDT 0.01% | $999.80 |
| AAPL AMZN BABA CRCL GME GOOGL HOOD META MSFT MSTR SKHY SNDK SPCX TSLA TSM INTC NFLX | PancakeSwap v3 USDT 0.25% | $995.01 |
| MRVL | PancakeSwap v3 USDT 1% | $980.10 |

Round-trip cost equals the pool fee twice; price impact at $1,000 is negligible.

**Verdict.** Pass. A contract can hold and trade all 21. Marvell costs about 2% per round trip, so it runs with a wider rebalance band or is excluded.

**Tooling notes.**
- Free public BSC RPCs keep only about a minute of state (0.45s blocks). A fork goes stale fast. Each run must fork fresh, or we need an archive RPC.
- The npm `anvil` wrapper spawns a child binary; killing the wrapper leaves the child holding the port. Run the binary directly.
