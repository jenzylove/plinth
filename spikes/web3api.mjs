// Spike S2: call Binance Web3 API RWA endpoints with signed requests. Keys come from env only.
import crypto from 'node:crypto';
const KEY=process.env.BINANCE_WEB3_API_KEY, SECRET=process.env.BINANCE_WEB3_SECRET_KEY;
const BASE='https://web3.binance.com';
async function get(path, q={}){
  const qs=new URLSearchParams(q).toString();const rp='/build'+path+(qs?'?'+qs:'');
  const ts=new Date().toISOString();
  const sign=crypto.createHmac('sha256',SECRET).update(ts+'GET'+rp+'').digest('base64');
  const r=await fetch(BASE+rp,{headers:{'X-OC-APIKEY':KEY,'X-OC-TIMESTAMP':ts,'X-OC-SIGN':sign}});
  const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t.slice(0,300)}
  return {status:r.status,body:j};
}
const NVDAB='0x02fca66c1d1afb4e2a7884261eb00f63598a7436', QQQB='0x205812cdbed920aff76c6580abd681a46d11efc7';
const calls=[
  ['platforms','/api/v1/dex/market/rwa/platforms',{}],
  ['price','/api/v1/dex/market/rwa/price',{binanceChainId:'56',tokenContractAddresses:`${NVDAB},${QQQB}`}],
  ['underlying-market NVDAB','/api/v1/dex/market/rwa/underlying-market',{binanceChainId:'56',tokenContractAddress:NVDAB}],
  ['underlying-profile NVDAB','/api/v1/dex/market/rwa/underlying-profile',{binanceChainId:'56',tokenContractAddress:NVDAB}],
];
for(const [n,p,q] of calls){const r=await get(p,q);console.log('==',n,r.status);console.log(JSON.stringify(r.body,null,1).slice(0,1800));}
