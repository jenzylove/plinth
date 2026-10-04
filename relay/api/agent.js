// The Plinth keeper agent's stable public address: /agent/* is forwarded to wherever the agent runs
// (AGENT_ORIGIN), so its ERC-8004 endpoint (https://plinth-relay.vercel.app/agent) never changes when the host does.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const origin = process.env.AGENT_ORIGIN;
  if (!origin) return res.status(503).json({ error: 'agent host not configured' });
  const path = String(req.query.path ?? '').replace(/^\/+/, '');
  const qs = new URLSearchParams(Object.entries(req.query).filter(([k]) => k !== 'path')).toString();
  const target = `${origin.replace(/\/$/, '')}/${path}${qs ? `?${qs}` : ''}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(target, {
      method: req.method,
      headers: { 'content-type': req.headers['content-type'] || 'application/json', accept: req.headers.accept || '*/*' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      signal: AbortSignal.timeout(25_000),
    });
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    return res.status(502).json({ error: 'agent unreachable', detail: String(e.message || e) });
  }
}
