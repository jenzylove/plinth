# Reviews and fixes

Plinth went through two written reviews while it was built: adversarial reads of the repository and the live system,
with severities, reproductions and recommended fixes. Neither is a third party audit. Every finding below was fixed in code or in what the product claims,
and every contract fix has a regression test on a fork of BSC mainnet. Contracts are immutable once a vault is opened,
so fixes ship as a new factory: v1 (2026-09-30), v2 (2026-10-04), v3 (2026-10-05), addresses in
[DEPLOYMENTS.md](DEPLOYMENTS.md). The earlier demo vaults were withdrawn by their saver and reopened on the next version.

## Review 1 (2026-10-03): v1 to v2

| Finding | What was wrong | Fix and proof |
|---|---|---|
| Keeper not 24/7 | The scheduled job ran every 3 to 5 hours, not every 5 minutes | The keeper agent now loops every minute on a container host and publishes its own gap counters at `/agent/keeper` |
| Protective sells blocked in a fast drop | For stocks Venus does not price, a 10 minute average was the only price, so sells failed against a stale price | The vault prices at the lower of a slow and a 60 second average. `test_crashSellsTowardSafety` passes; `test_v1Rule_slowPriceAloneCannotSellInACrash` keeps the old failure as evidence |
| A stolen keeper key could churn a vault | Cut to zero then raise to the cap, repeatedly, each way at the vault's slippage | Raises are +1 per four hours; `test_stolenKeeperCannotChurnTheVault` |
| One owner key could swap the keeper instantly | | Keeper changes and cap raises wait a day in public; removing the keeper is instant |
| Big vaults could not reduce risk | One swap past a thin pool's limit reverts | Trades are chunked at $10,000, vaults capped at $50,000; `test_bigVaultDerisksInChunks` |
| "24/7 trading fixes the overnight gap" was not shown | The replay credited the earnings cut, not around the clock trading | The replay now shows a desk that makes the same cuts; the off hours study uses real bStock prices ([proof page](https://plinth-savings.vercel.app/proof)) |
| Web3 API use was shallow | One endpoint | RWA Data, Market, Wallet, DeFi, Trading and Transaction APIs are all used; README lists each role |

## Review 2 (2026-10-04): v2 to v3

| Finding | What was wrong | Fix and test (`contracts/test/AuditFixes.t.sol`) |
|---|---|---|
| H1 | A refused top up made the vault forget the lending position it already held | A refused supply keeps tracking the position; `test_H1_refusedSupplyKeepsTrackingExistingPosition` |
| H2 | A lending market that would not redeem blocked every stock sale | The vault becomes sell only (never buys) and keeps the position tracked; `test_H2_blockedRedemptionStillLetsTheVaultSellStock` |
| H3 | One unreadable vault aborted the keeper's whole pass | Each vault is read and handled alone; `packages/keeper/test/isolation.test.ts` |
| H4 | A hung data source could stall the keeper forever | Every fetch has a deadline, safe leg pull outs run before any offchain data, a stuck pass is abandoned after 150 s; isolation test |
| H5 | Lowering a cap did not bind on open vaults | Targets use `min(multiplier, cap)`; `test_H5_capCutBindsWithoutTheKeeper` |
| H6 | Durable operation was unproven | Agent on a container host with uptime counters; 24 hour figure on the live endpoint |
| H7 | Copy promised more than the strategy enforces | The site says "a floor the strategy defends", with the conditions beside the deposit and the cushion rule explained correctly |
| M1 | Direct transfers bypassed the $50,000 limit | Held aside, returned on withdraw, never invested; `test_M1_transferAboveCapIsHeldAsideAndReturned` |
| M2 | A full exit sold everything in one swap | Staged exit in chunks; `test_M2_M6_stagedExitInChunksWithExecutedAmounts` |
| M3 | Exit estimates used a route the vault cannot take | Estimates quote the vault's own pool and fee tier; aggregator prices are labelled indicative |
| M4 | Backtest claims exceeded the method | The proof page states window sampling, miss tolerance, gross end value, fixed rate, in sample multipliers and exclusions |
| M5 | The price rule that took the lower of two averages accepted short downside holes | The live pool price must confirm a fall. Measured on a fork: holes of 5 to 60 seconds that recovered sold nothing under v3 (about half the stock part under v2), a 2 minute one trims about 11%; `test_M5_shortDownsidePrints` |
| M6 | The log showed requested drift as traded volume | A `Traded` event carries executed amounts and the log uses it |
| M7 | The relay accepted any RPC method and trusted self reported factories | Method allowlist, batch and body caps, timeouts, vault membership checked in the factory |
| L1 to L3 | Stale values, silent rounding, missing README and CI | Freshness per value, exact cents, README, CI |

## Known limits that remain

- The contracts have no third party audit. The two reviews above are not a substitute.
- The hourly off hours study is a coarse stand in for the contract's minute scale price rule; the fork tests measure the real rule.
- Per IP rate limits in the relay are per instance and best effort.
- The keeper is one hot wallet on one host. The contract limits what it can do and anyone can rebalance without it, but liveness of the paid for protection depends on that host.
- Rates float: if they fall, the floor rises and less stays in the stock.
