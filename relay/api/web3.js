// Relay for the Binance Web3 API. It runs in Singapore (sin1) because the API refuses calls from US IPs
// (code 40304). It signs with keys held in Vercel's environment and forwards only the calls Plinth uses.
//
// GET  /api/web3?path=/api/v1/dex/market/rwa/price&binanceChainId=56&tokenContractAddresses=0x...
// POST /api/web3  {"path": "/api/v1/defi/data/investment/list", "body": {...}}
//
// Every path is on an exact list. Nothing here can sign or send a transaction: quotes and simulations are
// read-only, and simulations are only relayed for Plinth's own contracts, so the key's quota is not a free
// service for anyone else. Each caller IP gets RATE_LIMIT requests a minute per relay instance.
import crypto from 'node:crypto';
import { createPublicClient, http, parseAbi, isAddress, getAddress } from 'viem';
import { bsc } from 'viem/chains';

const BASE = 'https://web3.binance.com';
const GET_PATHS = new Set([
  '/api/v1/dex/market/rwa/platforms',
  '/api/v1/dex/market/rwa/price',
  '/api/v1/dex/market/rwa/tokens',
  '/api/v1/dex/market/rwa/underlying-market',
  '/api/v1/dex/market/rwa/underlying-profile',
  '/api/v1/dex/market/rwa/kline',
  '/api/v1/dex/market/candles',
  '/api/v1/dex/market/trades',
  '/api/v1/dex/market/token/basic-info',
  '/api/v1/dex/market/token/top-liquidity',
  '/api/v1/dex/aggregator/quote',
]);
const POST_PATHS = new Set([
  '/api/v1/defi/data/investment/list',
  '/api/v1/defi/data/protocol/list',
  '/api/v1/dex/pre-transaction/simulate',
]);
// Factories whose contracts (the factory itself and the vaults it opened) may be simulated.
const FACTORIES = (process.env.PLINTH_FACTORIES || '0x57AB13A70d0BC7983196014b86D632eCAfD4b96f,0x6Dc31bF796C8B01aCE5E50878CF8BA18d9Fd5906,0x271cb3B56E133cd3488AB31e99766A288bC8DCe5')
  .split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
const RATE_LIMIT = 120;

// ip -> { minute, count }. Per relay instance and reset by cold starts: it stops a single client hammering one
// instance, not a distributed flood. Vercel's platform limits sit behind it.
const hits = new Map();
function limited(ip) {
  const minute = Math.floor(Date.now() / 60_000);
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip);
  if (!h || h.minute !== minute) { hits.set(ip, { minute, count: 1 }); return false; }
  return ++h.count > RATE_LIMIT;
}

const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });
const vaultAbi = parseAbi(['function factory() view returns (address)', 'function saver() view returns (address)']);
const factoryAbi = parseAbi(['function vaultsOf(address saver) view returns (address[])']);

/** True when `to` is a Plinth factory or a vault that factory actually opened: the vault's claimed factory must be
 *  one of ours AND list the vault among its saver's vaults, so a lookalike contract cannot pass by claiming it. */
async function isPlinth(to) {
  if (!isAddress(to)) return false;
  if (FACTORIES.includes(to.toLowerCase())) return true;
  try {
    const vault = getAddress(to);
    const [f, saver] = await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'factory' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'saver' }),
    ]);
    if (!FACTORIES.includes(f.toLowerCase())) return false;
    const list = await client.readContract({ address: f, abi: factoryAbi, functionName: 'vaultsOf', args: [saver] });
    return list.some((v) => v.toLowerCase() === vault.toLowerCase());
  } catch {
    return false;
  }
}

function sign(secret, ts, method, requestPath, body) {
  return crypto.createHmac('sha256', secret).update(ts + method + requestPath + body).digest('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: `more than ${RATE_LIMIT} requests a minute` });

  const key = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!key || !secret) return res.status(500).json({ error: 'relay has no API key configured' });

  let path, requestPath, body = '';
  if (req.method === 'GET') {
    const { path: p, ...query } = req.query;
    path = p;
    if (typeof path !== 'string' || !GET_PATHS.has(path)) return res.status(400).json({ error: 'path not allowed', allowed: [...GET_PATHS] });
    const qs = new URLSearchParams(query).toString();
    requestPath = '/build' + path + (qs ? '?' + qs : '');
  } else {
    let payload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    } catch {
      return res.status(400).json({ error: 'body is not JSON' });
    }
    path = payload.path;
    if (typeof path !== 'string' || !POST_PATHS.has(path)) return res.status(400).json({ error: 'path not allowed', allowed: [...POST_PATHS] });
    if (path === '/api/v1/dex/pre-transaction/simulate') {
      const tx = payload.body?.evmTx;
      if (payload.body?.binanceChainId !== '56' || !tx || !(await isPlinth(tx.to))) {
        return res.status(403).json({ error: 'simulations are relayed only for Plinth contracts on BSC' });
      }
    }
    body = JSON.stringify(payload.body ?? {});
    requestPath = '/build' + path;
  }

  const ts = new Date().toISOString();
  const started = Date.now();
  try {
    const r = await fetch(BASE + requestPath, {
      method: req.method,
      headers: {
        'X-OC-APIKEY': key,
        'X-OC-TIMESTAMP': ts,
        'X-OC-SIGN': sign(secret, ts, req.method, requestPath, body),
        ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(req.method === 'POST' ? { body } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    res.setHeader('X-Relay-Region', process.env.VERCEL_REGION || 'unknown');
    res.setHeader('X-Relay-Upstream-Ms', String(Date.now() - started));
    res.setHeader('Cache-Control', req.method === 'GET' ? 's-maxage=15, stale-while-revalidate=30' : 'no-store');
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'upstream unreachable', detail: String(e.message || e) });
  }
}
