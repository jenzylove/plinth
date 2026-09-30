// Reports where the relay runs, so callers can check it is outside the US.
export default function handler(req, res) {
  res.status(200).json({
    service: 'Plinth relay for the Binance Web3 API (read-only market data)',
    ok: true,
    region: process.env.VERCEL_REGION || 'unknown',
    keyConfigured: Boolean(process.env.BINANCE_WEB3_API_KEY),
    usage: '/api/web3?path=/api/v1/dex/market/rwa/price&binanceChainId=56&tokenContractAddresses=<bStock address>',
  });
}
