// Reports where the relay runs, so callers can check it is outside the US.
export default function handler(req, res) {
  res.status(200).json({ ok: true, region: process.env.VERCEL_REGION || 'unknown', keyConfigured: Boolean(process.env.BINANCE_WEB3_API_KEY) });
}
