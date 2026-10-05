---
name: plinth
description: |
  Use when the user wants to protect savings while owning US stocks on BNB Chain: "protect $50 in Nvidia",
  "put money in Apple but get it back", "capital protected", "floor", "Plinth vault", "how is my vault doing",
  "my vaults", "withdraw from Plinth", "leave my vault", "staged exit". Opens, checks and exits Plinth vaults
  (capital-protected bStock savings on BSC mainnet) from the user's Binance Agentic Wallet, previewing every call.
metadata:
  author: jenzylove
  version: '1.0.0'
  requiredCliVersion: '1.10.0'
  openclaw:
    requires:
      bins:
        - baw
        - curl
    install:
      - kind: node
        package: '@binance/agentic-wallet'
        bins: [baw]
        label: Install Binance Agentic Wallet CLI (npm)
---

# Plinth skill

Plinth is capital-protected savings on tokenized US stocks (bStocks) on BSC mainnet. The user deposits USDT, picks a
stock and a floor (100%, 95% or 90% of the deposit at 12 months), and the Plinth agent rebalances the vault around the
clock to defend that floor while part of it rides the stock. **The floor is defended by code, not guaranteed.** Say so
every time you describe it, and never say "guaranteed" or "risk free".

This skill plans each action as exact contract calls with the Plinth planner, then runs them through the user's own
Agentic Wallet with `baw contract-call preview` and `execute`. The planner only reads chain state and encodes calls;
it never signs or sends anything. All money moves through the user's wallet, one previewed call at a time.

Planner: `https://plinth-relay.vercel.app/api/plan` (source: `relay/api/plan.js` in github.com/jenzylove/plinth).

## Before anything

1. The wallet must be signed in: `baw wallet status`. If not, follow the Binance Agentic Wallet skill's sign-in.
2. Get the user's BSC address: `baw wallet address` (the EVM address). Call it `$W` below.
3. Developer Mode must be on in the Binance app for `contract-call`.

## Routing

| User intent | Planner call | Then |
|---|---|---|
| Which stocks can I protect? | `?action=stocks` | List names and caps |
| Protect $X in a stock with a floor | `?action=open&stock=<SYM or name>&floor=<100/95/90>&amount=<X>&from=$W` | Explain, confirm, run each step |
| How is my vault doing? / my vaults | `?action=vaults&saver=$W` (or `?action=status&vault=<addr>`) | Read the `summary` back |
| Withdraw N% / leave | `?action=withdraw&vault=<addr>&share=<N>&from=$W` | Confirm, run the step |
| Leave a big vault | `?action=exit&vault=<addr>&from=$W` | Confirm, run, then withdraw when the stock reaches $0 |

Fetch with `curl -s "<planner>?<query>"`. If the answer has an `error`, tell the user plainly and stop (for example:
not enough USDT, amount above the vault cap, unknown stock with the list of choices).

## Running a plan

The planner returns `steps`, each `{to, value, data, why}`. For each step, in order:

1. Tell the user what it does, using `why`, and for `open` repeat the floor and the `risks` line.
2. Preview it:
   ```bash
   baw contract-call preview --binanceChainId 56 --from $W --to <to> --value 0 --inputData <data> --json
   ```
3. Show the simulation: `simulationResult.simulationCode` must be `000000000`, and read out `balanceChanges` for the
   user's address (USDT out on open, USDT in on withdraw) and `allowanceChanges` on approve. If `risks.riskDetails`
   is not empty or the simulation failed, stop and explain; do not execute.
4. Ask the user to confirm this step. Only on an explicit yes:
   ```bash
   baw contract-call execute --requestId <requestId from the preview> --json
   ```
5. Report the `txHash` as `https://bscscan.com/tx/<txHash>`.

After an `open`, call `?action=vaults&saver=$W` and give the user the new vault's summary and its page:
`https://plinth-savings.vercel.app/vault/<vault address>`.

## What to tell the user

- What the floor means: at 12 months the vault aims to hold at least the floor; until then it is worth today's value,
  and withdrawing early returns today's value, not the promise.
- When it can fail: a fall in the stock bigger than the break distance before anyone can trade, the lending market
  failing faster than the health check, USDT losing its peg, or a bug in the contract. Rates float.
- The agent can cut risk at once and raise it back only one step per four hours; it can never withdraw. Only the
  saver can withdraw.
- A vault whose stock part is bigger than one trade ($10,000) leaves through a staged exit: the agent sells the stock
  in chunks, then the user withdraws everything.

## Rules

- Never execute without a preview and the user's explicit confirmation of that step.
- Never pass `--gasLimit` unless the user asks for a specific value.
- Never edit the planner's `data`; if the user changes the amount, stock or floor, plan again.
- Never move funds anywhere except the Plinth factory or the user's own vault; the planner only returns those targets.
