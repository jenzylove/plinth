/**
 * Plinth keeper inside the Agent Studio seller runtime.
 *
 * The agent's wallet is the Plinth factory's keeper. Every KEEPER_INTERVAL_S seconds it runs one pass
 * over every vault (pull out of unhealthy lending markets, set multipliers from scheduled risk,
 * rebalance outside the band). Signing is fixed code here, never an LLM tool, the same boundary Studio
 * keeps for its commerce rail. The contract limits what the keeper can do anyway: lower the multiplier,
 * move the safe leg between fixed markets, rebalance. It cannot take funds.
 *
 * Routes:
 *   GET /keeper      latest pass, running since, keeper address
 *   GET /keeper/log  every action the keeper took or tried, newest first
 */
import type { Express } from "express";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { getWallet } from "@bnbagent/studio-runtime/wallet";
import { Keeper, type Action, type PassReport } from "./keeper/keeper.js";

// The live factory; PLINTH_FACTORY overrides it (v1 was 0x57AB13A70d0BC7983196014b86D632eCAfD4b96f).
export const PLINTH_FACTORY = (process.env.PLINTH_FACTORY || "0x57AB13A70d0BC7983196014b86D632eCAfD4b96f") as Address;
const RELAY = "https://plinth-relay.vercel.app";

const passes: PassReport[] = [];
const actions: (Action & { at: string })[] = [];
const startedAt = new Date().toISOString();
let passCount = 0;
let lastPassAt: string | null = null;
let lastError: string | null = null;

function rpcUrl(): string {
  return process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org";
}

export function latestPass(): PassReport | undefined {
  return passes[passes.length - 1];
}

/** Plain summary the seller's LLM gets as context for a paid or free "vault report" job. */
export function keeperContext(): string {
  const p = latestPass();
  if (!p) return "The Plinth keeper has not completed a pass yet.";
  const recent = actions.slice(-10).map((a) => `${a.at} ${a.symbol} ${a.kind} ${a.status}: ${a.detail}${a.tx ? ` tx ${a.tx}` : ""}`);
  return [
    `Plinth keeper, latest pass at ${p.at} (block ${p.block}), ${p.vaults} vault(s).`,
    `Trading status: ${JSON.stringify(p.statuses)}.`,
    `Scheduled risk events within 4 days: ${p.events.map((e) => `${e.name} at ${new Date(e.at * 1000).toISOString()}`).join("; ") || "none"}.`,
    `Recent keeper actions:\n${recent.join("\n") || "none"}`,
    p.errors.length ? `Data sources that failed on the last pass: ${p.errors.join("; ")}` : "",
  ].join("\n");
}

export function startPlinthKeeper(app: Express): void {
  const wallet = getWallet();
  const pub = createPublicClient({ chain: bsc, transport: http(rpcUrl()) });
  const address = wallet.address as Address;

  // Fixed signing path: build the tx here, sign with the agent wallet, broadcast.
  const send = async ({ to, data }: { to: Address; data: Hex }): Promise<Hex> => {
    const [nonce, gasPrice, gas] = await Promise.all([
      pub.getTransactionCount({ address, blockTag: "pending" }),
      pub.getGasPrice(),
      pub.estimateGas({ account: address, to, data }),
    ]);
    const signed = await wallet.signTransaction({
      to, data, value: 0n, nonce, gasPrice, gas: (gas * 12n) / 10n, chainId: bsc.id, type: "legacy",
    } as any);
    return pub.sendRawTransaction({ serializedTransaction: signed.rawTransaction });
  };

  const keeper = new Keeper({
    rpcUrl: rpcUrl(),
    factory: PLINTH_FACTORY,
    relay: RELAY,
    sender: { address, send },
    dryRun: process.env.KEEPER_DRY_RUN === "1",
  });

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await keeper.pass();
      passes.push(r);
      passCount++;
      lastPassAt = r.at;
      if (passes.length > 200) passes.shift();
      for (const a of r.actions) actions.push({ ...a, at: r.at });
      if (actions.length > 2000) actions.splice(0, actions.length - 2000);
      lastError = null;
      if (r.actions.length) console.log(`[plinth-keeper] ${r.at} ${JSON.stringify(r.actions)}`);
    } catch (e) {
      lastError = (e as Error).message;
      console.error(`[plinth-keeper] pass failed: ${lastError}`);
    } finally {
      running = false;
    }
  };

  const every = Number(process.env.KEEPER_INTERVAL_S || 60) * 1000;
  void tick();
  setInterval(() => void tick(), every).unref?.();

  app.get("/keeper", (_req, res) => {
    res.json({
      keeper: address,
      factory: PLINTH_FACTORY,
      startedAt,
      intervalSeconds: every / 1000,
      passes: passCount,
      lastPassAt,
      dryRun: process.env.KEEPER_DRY_RUN === "1",
      lastError,
      latest: latestPass() ?? null,
    });
  });
  app.get("/keeper/log", (_req, res) => {
    res.json({ keeper: address, actions: [...actions].reverse() });
  });
  console.log(`[plinth-keeper] started for ${address}, every ${every / 1000}s`);
}
