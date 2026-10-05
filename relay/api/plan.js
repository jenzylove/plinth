// Plans Plinth actions as exact contract calls for a wallet to preview and execute (the Plinth Agentic Wallet skill
// uses this with `baw contract-call preview` / `execute`). Read-only: it never signs or sends anything.
//
// GET /api/plan?action=stocks
// GET /api/plan?action=open&stock=NVDA&floor=100&amount=50&from=0x...   approve (if needed) + open
// GET /api/plan?action=status&vault=0x...                                the vault, in plain numbers
// GET /api/plan?action=vaults&saver=0x...                                every vault of a saver
// GET /api/plan?action=withdraw&vault=0x...&share=100&from=0x...         withdraw a share (percent), or a staged exit
// GET /api/plan?action=exit&vault=0x...&from=0x...                       start a staged exit
import { createPublicClient, http, parseAbi, encodeFunctionData, isAddress, getAddress, parseUnits } from 'viem';
import { bsc } from 'viem/chains';

const FACTORY = '0x271cb3B56E133cd3488AB31e99766A288bC8DCe5'; // v3
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const NAMES = {
  '0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a': ['AAPL', 'Apple'], '0x1a4b499833a79a09ad7cf1d42d7dacf71e92eb00': ['AMZN', 'Amazon'],
  '0x4ef9d3062c7f6eba4aae4990c5036598c6eff4ec': ['BABA', 'Alibaba'], '0x80f3d493ebce97e343c53d29a137942416b4ffc0': ['CRCL', 'Circle'],
  '0x46ceefda28dd7207059ed19b0acdc026955bb15c': ['GME', 'GameStop'], '0x3f53de71c126bdabae20f9cd64848d317f6c3238': ['GOOGL', 'Alphabet'],
  '0xa394dcea3fd3847fd793afbfd163e2e3858b7c65': ['HOOD', 'Robinhood'], '0xe614e2fc6c787035ff51f452e8e826bfd32d5283': ['INTC', 'Intel'],
  '0x7425889fe94f9d693e8daefe88bcced6acfef4c0': ['META', 'Meta'], '0x80106cb3ead06659a5ad19df39d9b4733863b9b0': ['MSFT', 'Microsoft'],
  '0xe87afb3076aeb0f9b14e368de8145ae6a2826a14': ['MSTR', 'Strategy'], '0xd6829ea836b6fa224d099d40e54b31262f874631': ['NFLX', 'Netflix'],
  '0x02fca66c1d1afb4e2a7884261eb00f63598a7436': ['NVDA', 'Nvidia'], '0x205812cdbed920aff76c6580abd681a46d11efc7': ['QQQ', 'Nasdaq-100'],
  '0xca750ef65f295bbecd685abf54e82caf297bdb61': ['SKHY', 'SK Hynix'], '0x3ee4df61bd4f867e349beae8bfe07bc31b4850fb': ['SNDK', 'SanDisk'],
  '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1': ['SPCX', 'SpaceX'], '0x7138b48df7d98d7e3cc221baf7192d0a178182d8': ['SPY', 'S&P 500'],
  '0x5b1910eaad6450e50f816082aa078c41f10c292f': ['TSLA', 'Tesla'], '0xab78b89b5bb00236be0b4b20704cbfa04efc711c': ['TSM', 'TSMC'],
};
const STOCK = 'struct StockConfig { address token; address pool; address router; uint24 fee; bool pancake; bool venusPriced; uint32 twapWindow; uint64 cap; uint64 band; uint64 maxSlippage; uint32 fastWindow; uint128 maxTrade; uint128 maxVault; }';
const factoryAbi = parseAbi([
  STOCK, 'function stockCount() view returns (uint256)', 'function stock(uint256) view returns (StockConfig)',
  'function stockEnabled(uint256) view returns (bool)', 'function minOpen() view returns (uint256)',
  'function vaultsOf(address) view returns (address[])', 'function open(uint256 stockId, uint256 promiseBps, uint256 amount) returns (address)',
]);
const vaultAbi = parseAbi([
  STOCK, 'function stock() view returns (StockConfig)', 'function saver() view returns (address)', 'function factory() view returns (address)',
  'struct Status { uint256 total; uint256 stockUsd; uint256 safeUsd; uint256 price; uint256 slowPrice; uint256 fastPrice; uint256 floor; uint256 target; uint256 breakDistance; uint256 floorRate; uint256 multiplier; uint256 cap; uint256 promised; uint256 deposited; uint256 maturity; uint256 marketIndex; uint8 gateCode; uint256 nextRaiseAt; uint256 idleSince; uint256 excess; bool impaired; bool exiting; }',
  'function status() view returns (Status)', 'function withdraw(uint256 share)', 'function beginExit()',
]);
const erc20 = parseAbi(['function allowance(address,address) view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);
const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || 'https://bsc-dataseed1.defibit.io') });

const w = (x) => Number(x) / 1e18;
const usd = (x) => '$' + x.toFixed(2);
const MARKETS = ['plain USDT', 'Venus', 'Aave'];

async function stocks() {
  const n = Number(await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockCount' }));
  const rows = await Promise.all(Array.from({ length: n }, async (_, id) => {
    const [s, on] = await Promise.all([
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stock', args: [BigInt(id)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockEnabled', args: [BigInt(id)] }),
    ]);
    const [sym, name] = NAMES[s.token.toLowerCase()] ?? [s.token, s.token];
    return { id, sym, name, token: s.token, enabled: on, cap: w(s.cap), maxVault: w(s.maxVault) };
  }));
  return rows.filter((r) => r.enabled);
}

async function status(vault) {
  const [s, saver] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'status' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'saver' }),
  ]);
  const cfg = await client.readContract({ address: vault, abi: vaultAbi, functionName: 'stock' });
  const [sym, name] = NAMES[cfg.token.toLowerCase()] ?? [cfg.token, 'the stock'];
  const bd = s.breakDistance > 10n ** 30n ? null : w(s.breakDistance);
  return {
    vault, saver, stock: sym, value: w(s.total), floor: w(s.floor), promised: w(s.promised), maturity: new Date(Number(s.maturity) * 1000).toISOString().slice(0, 10),
    inStock: w(s.stockUsd), safe: w(s.safeUsd), market: MARKETS[Number(s.marketIndex)] ?? `market ${s.marketIndex}`, breakDistance: bd,
    multiplier: w(s.multiplier), impaired: s.impaired, exiting: s.exiting, heldAside: w(s.excess), maxTrade: w(cfg.maxTrade),
    summary: `${name} vault: ${usd(w(s.total))} now, ${usd(w(s.stockUsd))} in ${name} and ${usd(w(s.safeUsd))} lent on ${MARKETS[Number(s.marketIndex)] ?? 'a market'}. ` +
      `Floor today ${usd(w(s.floor))}, defended toward ${usd(w(s.promised))} by ${new Date(Number(s.maturity) * 1000).toISOString().slice(0, 10)}. ` +
      (bd === null ? 'No stock held right now.' : `${name} would have to drop ${(bd * 100).toFixed(1)}% at once to touch the floor.`) +
      (s.exiting ? ' A staged exit is selling the stock in chunks.' : '') + (s.impaired ? ' Its lending market is not paying out; the vault is sell-only until it does.' : ''),
  };
}

const call = (to, data, why) => ({ to, value: '0', data, why });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query;
  try {
    switch (q.action) {
      case 'stocks':
        return res.json({ factory: FACTORY, stocks: await stocks() });
      case 'status':
        if (!isAddress(q.vault)) return res.status(400).json({ error: 'vault must be an address' });
        return res.json(await status(getAddress(q.vault)));
      case 'vaults': {
        if (!isAddress(q.saver)) return res.status(400).json({ error: 'saver must be an address' });
        const list = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'vaultsOf', args: [getAddress(q.saver)] });
        return res.json({ saver: getAddress(q.saver), vaults: await Promise.all(list.map(status)) });
      }
      case 'open': {
        if (!isAddress(q.from)) return res.status(400).json({ error: 'from must be the wallet address' });
        const floor = Number(q.floor ?? 100);
        if (![100, 95, 90].includes(floor)) return res.status(400).json({ error: 'floor must be 100, 95 or 90 (percent back at 12 months)' });
        const list = await stocks();
        const st = list.find((s) => s.sym.toLowerCase() === String(q.stock ?? '').toLowerCase() || s.name.toLowerCase() === String(q.stock ?? '').toLowerCase());
        if (!st) return res.status(400).json({ error: 'unknown stock', choices: list.map((s) => `${s.sym} (${s.name})`) });
        const amount = parseUnits((Math.floor(Number(q.amount) * 100) / 100).toFixed(2), 18);
        const from = getAddress(q.from);
        const [minOpen, allowance, balance] = await Promise.all([
          client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'minOpen' }),
          client.readContract({ address: USDT, abi: erc20, functionName: 'allowance', args: [from, FACTORY] }),
          client.readContract({ address: USDT, abi: erc20, functionName: 'balanceOf', args: [from] }),
        ]);
        if (amount < minOpen) return res.status(400).json({ error: `smallest first deposit is ${usd(w(minOpen))}` });
        if (w(amount) > st.maxVault) return res.status(400).json({ error: `one ${st.name} vault holds at most ${usd(st.maxVault)}` });
        if (balance < amount) return res.status(400).json({ error: `the wallet holds ${usd(w(balance))} USDT on BSC` });
        const steps = [];
        if (allowance < amount) steps.push(call(USDT, encodeFunctionData({ abi: erc20, functionName: 'approve', args: [FACTORY, amount] }), `Allow the Plinth factory to move exactly ${usd(w(amount))} USDT.`));
        steps.push(call(FACTORY, encodeFunctionData({ abi: factoryAbi, functionName: 'open', args: [BigInt(st.id), BigInt(floor * 100), amount] }),
          `Open a ${st.name} vault with ${usd(w(amount))}: a ${floor}% floor at 12 months that the Plinth agent defends; part goes into ${st.name}, the rest is lent on Venus or Aave. Not guaranteed.`));
        return res.json({ action: 'open', stock: st.sym, floor, amount: w(amount), steps, risks: 'A fall bigger than the break distance before anyone can trade, the lending market, USDT\'s peg and the contract itself.' });
      }
      case 'withdraw':
      case 'exit': {
        if (!isAddress(q.vault) || !isAddress(q.from)) return res.status(400).json({ error: 'vault and from must be addresses' });
        const s = await status(getAddress(q.vault));
        if (s.saver.toLowerCase() !== String(q.from).toLowerCase()) return res.status(403).json({ error: `only the saver ${s.saver} can withdraw` });
        if (q.action === 'exit' || (q.action === 'withdraw' && s.inStock * Number(q.share ?? 100) / 100 > s.maxTrade)) {
          if (s.exiting) return res.json({ action: 'exit', note: 'A staged exit is already running; withdraw everything once the stock reaches $0.', status: s });
          return res.json({ action: 'exit', note: `The stock part is bigger than one trade (${usd(s.maxTrade)}): start a staged exit, then withdraw once the agent has sold it.`,
            steps: [call(s.vault, encodeFunctionData({ abi: vaultAbi, functionName: 'beginExit' }), 'Start a staged exit: the agent sells the stock in chunks into USDT.')], status: s });
        }
        const pct = Math.min(100, Math.max(1, Number(q.share ?? 100)));
        const share = BigInt(Math.round(pct * 1e4)) * 10n ** 12n;
        return res.json({ action: 'withdraw', share: pct, status: s,
          steps: [call(s.vault, encodeFunctionData({ abi: vaultAbi, functionName: 'withdraw', args: [share] }), `Withdraw ${pct}% of the vault at today's value, about ${usd(s.value * pct / 100)} before the sale cost.`)] });
      }
      default:
        return res.status(400).json({ error: 'action must be stocks, open, status, vaults, withdraw or exit' });
    }
  } catch (e) {
    return res.status(502).json({ error: String(e.shortMessage || e.message || e).slice(0, 300) });
  }
}
