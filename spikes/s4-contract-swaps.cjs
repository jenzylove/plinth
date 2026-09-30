// Spike S4: can a contract address receive and sell each liquid bStock through PancakeSwap/Uniswap v3?
const {ethers}=require('ethers');const fs=require('fs');
const p=new ethers.JsonRpcProvider('http://127.0.0.1:'+(process.env.PORT||8545));
const USDT='0x55d398326f99059fF775485246999027B3197955',USDC='0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const WHALE='0xF977814e90dA44bFA03b6295A0616a897441aceC';
const ROUTERS={pcs:'0x1b81D678ffb9C0263b24A97847620C99d213eB14',uni:'0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2'};
const erc=['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)'];
const rabi=['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)'];
const rabiUni=['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)'];
const depth=JSON.parse(fs.readFileSync(__dirname+'/depth.json'));const addr={};
for(const l of fs.readFileSync(__dirname+'/bl.txt','utf8').trim().split('\n')){const [k,a]=l.split(' ');addr[k]=a}
(async()=>{
 const vault=ethers.Wallet.createRandom().address;
 await p.send('anvil_setCode',[vault,'0x00']);
 await p.send('anvil_impersonateAccount',[vault]);await p.send('anvil_setBalance',[vault,'0x56BC75E2D63100000']);
 await p.send('anvil_impersonateAccount',[WHALE]);await p.send('anvil_setBalance',[WHALE,'0x56BC75E2D63100000']);
 const w=await p.getSigner(WHALE);const v=await p.getSigner(vault);
 await (await new ethers.Contract(USDT,erc,w).transfer(vault,ethers.parseUnits('200000',18))).wait();
 try{await (await new ethers.Contract(USDC,erc,w).transfer(vault,ethers.parseUnits('50000',18))).wait()}catch(e){console.log('no USDC from whale')}
 const res=[];
 for(const d of depth.filter(x=>x.cost!==undefined && x.cost<=1.3 && (!process.env.ONLY||x.k===process.env.ONLY))){
  const [dex,q,feeS]=d.venue.split('/');const fee=Number(feeS);const quote=q==='USDT'?USDT:USDC;const tok=addr[d.k];
  const R=ROUTERS[dex];const r=new ethers.Contract(R,dex==='pcs'?rabi:rabiUni,v);
  try{
   const qt=new ethers.Contract(quote,erc,v);await (await qt.approve(R,ethers.MaxUint256)).wait();
   const amt=ethers.parseUnits('1000',18);
   const b1={tokenIn:quote,tokenOut:tok,fee,recipient:vault,amountIn:amt,amountOutMinimum:0,sqrtPriceLimitX96:0};
   await (await r.exactInputSingle(dex==='pcs'?{...b1,deadline:9999999999}:b1)).wait();
   const tb=await new ethers.Contract(tok,erc,v).balanceOf(vault);
   await (await new ethers.Contract(tok,erc,v).approve(R,ethers.MaxUint256)).wait();
   const before=await qt.balanceOf(vault);
   const b2={tokenIn:tok,tokenOut:quote,fee,recipient:vault,amountIn:tb,amountOutMinimum:0,sqrtPriceLimitX96:0};
   await (await r.exactInputSingle(dex==='pcs'?{...b2,deadline:9999999999}:b2)).wait();
   const back=Number(ethers.formatUnits((await qt.balanceOf(vault))-before,18));
   res.push([d.k,'OK',`$1000 round trip -> $${back.toFixed(2)}`,d.venue]);
  }catch(e){res.push([d.k,'FAIL',(e.shortMessage||e.message).slice(0,100),d.venue])}
 }
 for(const r of res)console.log(r.join(' | '));
})();
