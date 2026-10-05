// Every action of one Plinth vault, read from BSC event logs with the archive RPC (server-side only).
// GET /api/vault-log?vault=0x... -> { vault, fromBlock, toBlock, rows: [{ event, block, time, tx, logIndex, args, detail }] }
import { createPublicClient, http, parseAbi, isAddress, getAddress, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const FACTORY_BLOCK = 124_973_776n; // PlinthFactory v1 0x57AB…b96f deployed here; no vault is older
const RANGE = 50_000n; // the archive RPC's eth_getLogs limit
const MARKETS = ['plain USDT', 'Venus', 'Aave'];
const REASONS = ['within band', 'drift', 'cushion gone', 'below minimum trade'];

const abi = parseAbi([
  'event Deposited(address indexed from, uint256 amount, uint256 promised)',
  'event Rebalanced(uint8 reason, int256 deltaUsd, uint256 price, uint256 total, uint256 floor, uint256 target, uint256 multiplier)',
  'event PulledOut(uint256 indexed marketIndex, uint8 gateCode)',
  'event MovedSafeLeg(uint256 indexed from, uint256 indexed to, uint256 amount)',
  'event MultiplierSet(address indexed by, uint256 multiplier)',
  'event Withdrawn(uint256 share, uint256 usdtOut, uint256 promisedLeft)',
  'event WithdrawnInKind(uint256 share, uint256 stockOut, uint256 receiptOut, uint256 usdtOut)',
  'event Rolled(uint256 maturity, uint256 promised)',
  'event Traded(bool buy, uint256 usdtAmount, uint256 tokens)',
  'event Impaired(uint256 indexed marketIndex, uint8 gateCode)',
  'event SupplyRefused(uint256 indexed marketIndex, uint256 amount)',
  'event HeldAside(uint256 amount, uint256 excess)',
  'event ExitStarted()',
  'event ExitCancelled()',
]);

const usd = (x) => '$' + Number(formatUnits(x < 0n ? -x : x, 18)).toFixed(2);
const wad = (x) => Number(formatUnits(x, 18));

function detail(name, a) {
  switch (name) {
    case 'Deposited': return `${usd(a.amount)} in; promise now ${usd(a.promised)}`;
    // deltaUsd is the drift the vault saw before the one-trade cap; what actually traded is in the Traded event.
    case 'Rebalanced': return `rebalance (${REASONS[a.reason] ?? a.reason}): ${a.deltaUsd >= 0n ? 'wanted to buy' : 'wanted to sell'} ${usd(a.deltaUsd)} at value ${usd(a.total)}, floor ${usd(a.floor)}, multiplier ${wad(a.multiplier)}`;
    case 'Traded': return `${a.buy ? 'bought' : 'sold'} ${Number(formatUnits(a.tokens, 18)).toFixed(6)} stock for ${usd(a.usdtAmount)}`;
    case 'Impaired': return `${MARKETS[Number(a.marketIndex)] ?? a.marketIndex} failed its gate (code ${a.gateCode}) and would not redeem: sell-only until it does`;
    case 'SupplyRefused': return `${MARKETS[Number(a.marketIndex)] ?? a.marketIndex} refused ${usd(a.amount)}; kept as idle USDT`;
    case 'HeldAside': return `${usd(a.amount)} above the principal cap held aside (total aside ${usd(a.excess)})`;
    case 'ExitStarted': return 'saver started a staged exit: stock sold in chunks';
    case 'ExitCancelled': return 'saver cancelled the staged exit';
    case 'PulledOut': return `pulled out of ${MARKETS[Number(a.marketIndex)] ?? a.marketIndex} (gate code ${a.gateCode})`;
    case 'MovedSafeLeg': return `safe leg ${usd(a.amount)} from ${MARKETS[Number(a.from)]} to ${MARKETS[Number(a.to)]}`;
    case 'MultiplierSet': return `multiplier set to ${wad(a.multiplier)} by ${a.by}`;
    case 'Withdrawn': return `${(wad(a.share) * 100).toFixed(1)}% withdrawn: ${usd(a.usdtOut)} out`;
    case 'WithdrawnInKind': return `${(wad(a.share) * 100).toFixed(1)}% withdrawn in kind`;
    case 'Rolled': return `rolled into a new term; promise ${usd(a.promised)}`;
    default: return '';
  }
}

/** The block the contract at `address` was created in: binary search on its code, from the v1 factory block. */
async function createdAt(client, address, latest) {
  const has = async (b) => ((await client.getCode({ address, blockNumber: b })) ?? '0x') !== '0x';
  if (!(await has(latest))) return null;
  let lo = FACTORY_BLOCK, hi = latest;
  if (await has(lo)) return lo;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (await has(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const vault = String(req.query.vault || '');
  if (!isAddress(vault)) return res.status(400).json({ error: 'vault must be an address' });
  const rpc = process.env.BSC_ARCHIVE_RPC_URL;
  if (!rpc) return res.status(503).json({ error: 'archive RPC not configured' });
  try {
    const client = createPublicClient({ chain: bsc, transport: http(rpc) });
    const latest = await client.getBlockNumber();
    const start = await createdAt(client, getAddress(vault), latest);
    if (start === null) return res.status(404).json({ error: 'no contract at this address' });
    const chunks = [];
    for (let from = start; from <= latest; from += RANGE) {
      const to = from + RANGE - 1n < latest ? from + RANGE - 1n : latest;
      chunks.push(client.getContractEvents({ address: getAddress(vault), abi, fromBlock: from, toBlock: to }));
    }
    const logs = (await Promise.all(chunks)).flat();
    const blocks = [...new Set(logs.map((l) => l.blockNumber))];
    const times = new Map(await Promise.all(blocks.map(async (b) => [b, Number((await client.getBlock({ blockNumber: b })).timestamp)])));
    const rows = logs.map((l) => ({
      event: l.eventName,
      block: Number(l.blockNumber),
      time: times.get(l.blockNumber),
      tx: l.transactionHash,
      logIndex: l.logIndex,
      args: JSON.parse(JSON.stringify(l.args, (_, v) => (typeof v === 'bigint' ? v.toString() : v))),
      detail: detail(l.eventName, l.args),
    })).reverse();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ vault: getAddress(vault), fromBlock: Number(start), toBlock: Number(latest), rows });
  } catch (e) {
    return res.status(502).json({ error: 'could not read logs: ' + (e.shortMessage || e.message) });
  }
}
