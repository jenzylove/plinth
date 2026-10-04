// One BSC JSON-RPC endpoint that answers everything the agent needs. Free public nodes each refuse something:
// publicnode refuses receipts ("archive requests require a personal token"), the BNB dataseeds refuse eth_getLogs
// ("limit exceeded"). This routes eth_getLogs to publicnode and every other method to the dataseeds.
// POST /api/rpc with a JSON-RPC request or batch.
const LOGS = ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'];
const REST = ['https://bsc-dataseed1.defibit.io', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.ninicoin.io'];

async function forward(call) {
  const upstreams = call?.method === 'eth_getLogs' ? LOGS : REST;
  let last;
  for (const url of upstreams) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call), signal: AbortSignal.timeout(15_000) });
      const j = await r.json();
      if (!j.error || j.error.code === 3 || /revert/i.test(j.error.message || '')) return j; // a revert is an answer
      last = j;
    } catch (e) {
      last = { jsonrpc: '2.0', id: call?.id ?? null, error: { code: -32603, message: `upstream failed: ${e.message}` } };
    }
  }
  return last;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST a JSON-RPC request' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const out = Array.isArray(body) ? await Promise.all(body.map(forward)) : await forward(body);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
}
