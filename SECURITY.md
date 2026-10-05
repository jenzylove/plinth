# Security

Plinth holds savers' USDT in one vault contract per saver on BSC mainnet. This page says what is trusted, what is
not, and how to report a problem.

## Reporting

Email **jennifereze12@gmail.com** with "Plinth security" in the subject, or open a private security advisory on this
repository. Include the contract (vault, factory or implementation address from [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md)),
what you did, and what happened. I will acknowledge within two days. There is no bounty programme; credit goes in the
fix notes if you want it. Please do not test against other people's vaults. The demo vault in the README is mine and
small: test there.

## What each party can do

| Party | Can | Cannot |
|---|---|---|
| Saver | Deposit, withdraw (all or a share), withdraw in kind, start and cancel a staged exit, roll at maturity | Change the stock, the floor or the markets after opening |
| Anyone | Call `rebalance()`, `pullOutIfUnhealthy()`, `sync()`, send USDT to a vault (credited up to the principal cap, the rest held aside and returned to the saver) | Move a saver's funds anywhere |
| Keeper (the Plinth agent) | Cut the multiplier at once, raise it back one step (+1) per four hours up to the cap, move the safe leg between the factory's fixed markets | Withdraw, send funds to any address, raise the multiplier past the cap, trade at a worse price than the vault's own limit |
| Factory owner | List stocks, disable a stock or market, lower a cap at once, queue a higher cap or a new keeper (applies after one day, in public), remove the keeper at once | Touch an open vault's funds, change a vault's pool, router or markets, raise an open vault past the cap it opened with |

Fixed at deploy and not changeable by anyone: USDT, the price oracle, the lending markets (Venus core USDT and Aave v3
USDT), the health gate limits, the highest floor rate, the term. A vault copies its stock's pool, router, fee tier,
slippage and size limits when it opens.

## Trust and failure modes

- **Smart contract risk.** The contracts are unaudited by a third party. They went through two written reviews during the
  build and every finding was fixed ([docs/AUDITS.md](docs/AUDITS.md)); every contract fix has a mainnet fork regression test. A bug can lose funds.
- **The floor is not a guarantee.** It is defended by rules. It fails if the stock falls more than the break distance
  before anyone can trade, if the lending market fails faster than the health gate, if USDT loses its peg, or if the
  contract has a bug. There is no insurer or reserve behind it.
- **The keeper key.** One hot wallet (0xB12a…1A1b) signs the keeper's calls from a container host. The contract limits
  what a stolen key can do: it cannot withdraw, cannot raise risk faster than +1 per four hours and cannot exceed the
  cap; the owner can remove it at once. Even so, a thief could lower multipliers and sell stock at the vault's own price
  limits. Anyone can rebalance a vault, so vaults stay defended with no keeper at all.
- **The owner key.** One wallet owns the factory. Anything that adds risk waits a day in public.
- **Prices.** The vault trades at no worse than 1% to 1.5% under its own price (`min(slow reference, max(60-second
  average, live pool price))`). Thin pools and bad prints are real: see the off hours study on the proof page.
- **Third parties.** Venus, Aave, PancakeSwap, Uniswap, the bStock issuer and the Binance Web3 API are outside this
  repository. A bStock can be paused by its issuer; a normal withdrawal then reverts and withdrawing in kind is the exit.

## Secrets

No keys are committed. The agent's wallet keystore, the pinning key and the host token live in environment variables on
the host and in an untracked folder (`.studio/`). The history was scanned for keys before the repository was made public.
The relay forwards only an exact list of read endpoints and simulations of Plinth's own contracts, and it never signs
or sends a transaction.

## Scope

In scope: the contracts in `contracts/src`, the keeper in `packages/keeper`, the agent in `agent/plinthkeeper`, the relay
in `relay/`. Out of scope: the third party protocols above, and the demo site's availability.
