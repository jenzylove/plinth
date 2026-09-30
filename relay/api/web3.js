// Relay for the Binance Web3 API. It runs in Singapore (sin1) because the API refuses calls from US IPs
// (code 40304). It signs with keys held in Vercel's environment and forwards read-only market calls.
//
// GET /api/web3?path=/api/v1/dex/market/rwa/price&binanceChainId=56&tokenContractAddresses=0x...
import crypto from 'node:crypto';

const BASE = 'https://web3.binance.com';
// Read-only endpoints only. Anything that trades or signs does not go through a public relay.
const ALLOWED = [
  '/api/v1/dex/market/rwa/',
  '/api/v1/dex/market/',
  '/api/v1/dex/defi/',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const { path, ...query } = req.query;
  if (typeof path !== 'string' || !ALLOWED.some((p) => path.startsWith(p)) || path.includes('..')) {
    return res.status(400).json({ error: 'path not allowed' });
  }
  const key = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!key || !secret) return res.status(500).json({ error: 'relay has no API key configured' });

  const qs = new URLSearchParams(query).toString();
  const requestPath = '/build' + path + (qs ? '?' + qs : '');
  const ts = new Date().toISOString();
  const sign = crypto.createHmac('sha256', secret).update(ts + 'GET' + requestPath).digest('base64');
  const started = Date.now();
  try {
    const r = await fetch(BASE + requestPath, {
      headers: { 'X-OC-APIKEY': key, 'X-OC-TIMESTAMP': ts, 'X-OC-SIGN': sign },
    });
    const text = await r.text();
    res.setHeader('X-Relay-Region', process.env.VERCEL_REGION || 'unknown');
    res.setHeader('X-Relay-Upstream-Ms', String(Date.now() - started));
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: 'upstream unreachable', detail: String(e.message || e) });
  }
}
