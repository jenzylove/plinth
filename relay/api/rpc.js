// One BSC JSON-RPC endpoint that answers everything the keeper agent needs. Free public nodes each refuse something:
// publicnode refuses receipts ("archive requests require a personal token"), the BNB dataseeds refuse eth_getLogs
// ("limit exceeded"). This routes eth_getLogs to publicnode and every other allowed method to the dataseeds.
// POST /api/rpc with a JSON-RPC request or a batch of at most MAX_BATCH. Only the read methods and raw-transaction
// broadcast an agent needs are forwarded; every upstream call has a deadline.
const LOGS = ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'];
const REST = ['https://bsc-dataseed1.defibit.io', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.ninicoin.io'];
const ALLOWED = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_call',
  'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance', 'eth_getCode',
  'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs',
  'eth_sendRawTransaction',
]);
const MAX_BATCH = 20;
const MAX_BODY = 64 * 1024;
const UPSTREAM_MS = 12_000;
const RATE_LIMIT = 600; // requests a minute per caller IP, per relay instance (best effort; see M7 in docs/PLAN.md)

const hits = new Map();
function limited(ip) {
  const minute = Math.floor(Date.now() / 60_000);
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip);
  if (!h || h.minute !== minute) { hits.set(ip, { minute, count: 1 }); return false; }
  return ++h.count > RATE_LIMIT;
}

const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function forward(call) {
  if (!call || typeof call !== 'object' || typeof call.method !== 'string') return fail(call?.id, -32600, 'invalid request');
  if (!ALLOWED.has(call.method)) return fail(call.id, -32601, `method not allowed: ${call.method}`);
  const upstreams = call.method === 'eth_getLogs' ? LOGS : REST;
  let last;
  for (const url of upstreams) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call),
        signal: AbortSignal.timeout(UPSTREAM_MS),
      });
      const j = await r.json();
      if (!j.error || j.error.code === 3 || /revert/i.test(j.error.message || '')) return j; // a revert is an answer
      last = j;
    } catch (e) {
      last = fail(call.id, -32603, `upstream failed: ${e.message}`);
    }
  }
  return last;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(fail(null, -32600, 'POST a JSON-RPC request'));
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json(fail(null, -32005, `more than ${RATE_LIMIT} requests a minute`));
  let body;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null);
    if (raw.length > MAX_BODY) return res.status(413).json(fail(null, -32600, `body over ${MAX_BODY} bytes`));
    body = typeof req.body === 'string' ? JSON.parse(raw) : req.body;
  } catch {
    return res.status(400).json(fail(null, -32700, 'parse error'));
  }
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH) return res.status(400).json(fail(null, -32600, `batch must hold 1 to ${MAX_BATCH} calls`));
    return res.status(200).json(await Promise.all(body.map(forward)));
  }
  return res.status(200).json(await forward(body));
}
