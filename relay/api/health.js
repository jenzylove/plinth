// Reports where the relay runs, so callers can check it is outside the US.
export default function handler(req, res) {
  res.status(200).json({
    service: 'Plinth relay for the Binance Web3 API: market data, RWA data, quotes, DeFi data, and simulations of Plinth transactions. Exact path list, no signing or sending.',
    ok: true,
    region: process.env.VERCEL_REGION || 'unknown',
    keyConfigured: Boolean(process.env.BINANCE_WEB3_API_KEY),
    usage: {
      get: '/api/web3?path=/api/v1/dex/market/rwa/price&binanceChainId=56&tokenContractAddresses=<bStock address>',
      post: '/api/web3 {"path": "/api/v1/defi/data/investment/list", "body": {"investType": "Earn", "binanceChainId": "56"}}',
      log: '/api/vault-log?vault=<vault address>',
    },
  });
}
