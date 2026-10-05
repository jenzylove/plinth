// Run the keeper: `tsx src/cli.ts --once` for one pass, or no flag to loop.
// Env: BSC_RPC_URL (or BSC_ARCHIVE_RPC_URL), KEEPER_PRIVATE_KEY (optional; without it the keeper only
// reports), KEEPER_DRY_RUN=1 to simulate only, KEEPER_INTERVAL_S (default 60).
import { appendFileSync, mkdirSync } from 'node:fs';
import { Keeper } from './keeper.js';

// The live factory (v3). PLINTH_FACTORY overrides it (v2 0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906, v1 0x57AB13A70d0BC7983196014b86D632eCAfD4b96f).
const FACTORY = (process.env.PLINTH_FACTORY ?? '0x271cb3B56E133cd3488AB31e99766A288bC8DCe5') as `0x${string}`;
const RELAY = 'https://plinth-relay.vercel.app';

const rpcUrl = process.env.BSC_RPC_URL ?? process.env.BSC_ARCHIVE_RPC_URL;
if (!rpcUrl) throw new Error('set BSC_RPC_URL');
const key = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
const keeper = new Keeper({
  rpcUrl,
  factory: FACTORY,
  relay: RELAY,
  privateKey: key ? ((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`) : undefined,
  dryRun: process.env.KEEPER_DRY_RUN === '1' || !key,
  // KEEPER_NOW (unix seconds) replays a pass as if run at another time, for testing the event policy.
  now: process.env.KEEPER_NOW ? () => Number(process.env.KEEPER_NOW) : undefined,
});
const logDir = new URL('../log/', import.meta.url);
mkdirSync(logDir, { recursive: true });

async function once() {
  const r = await keeper.pass();
  appendFileSync(new URL('passes.jsonl', logDir), JSON.stringify(r) + '\n');
  console.log(JSON.stringify(r, null, 1));
}

if (process.argv.includes('--once')) await once();
else {
  const every = Number(process.env.KEEPER_INTERVAL_S ?? 60) * 1000;
  for (;;) {
    try { await once(); } catch (e) { console.error(new Date().toISOString(), (e as Error).message); }
    await new Promise((r) => setTimeout(r, every));
  }
}
