// Live reads from BSC mainnet. Every number the app shows comes from here or from a sourced data file.
import { createPublicClient, fallback, http, parseAbi, type Address } from 'viem';
import { bsc } from 'viem/chains';

export const FACTORY: Address = '0x57AB13A70d0BC7983196014b86D632eCAfD4b96f';
export const USDT: Address = '0x55d398326f99059fF775485246999027B3197955';
export const VENUS_ORACLE: Address = '0x6592b5DE802159F3E74B2486b091D11a8256ab8A';
export const DEMO_VAULT: Address = '0x7285CF07Cb75C4FC5065eC3a72a3ec52A5f12095';
export const BSCSCAN = 'https://bscscan.com';

export const client = createPublicClient({
  chain: bsc,
  transport: fallback([http('https://bsc-dataseed.bnbchain.org'), http('https://bsc-rpc.publicnode.com')]),
  batch: { multicall: true },
});

const WAD = 10n ** 18n;
export const fromWad = (x: bigint) => Number(x) / 1e18;

export const factoryAbi = parseAbi([
  'struct StockConfig { address token; address pool; address router; uint24 fee; bool pancake; bool venusPriced; uint32 twapWindow; uint64 cap; uint64 band; uint64 maxSlippage; }',
  'struct Market { uint8 kind; address target; address receipt; address debt; }',
  'struct GateLimits { uint64 minCashMultiple; uint64 maxUtilization; uint64 maxPegDeviation; }',
  'function stockCount() view returns (uint256)',
  'function stock(uint256 id) view returns (StockConfig)',
  'function liveCap(uint256 id) view returns (uint256)',
  'function stockEnabled(uint256 id) view returns (bool)',
  'function marketCount() view returns (uint256)',
  'function market(uint256 i) view returns (Market)',
  'function marketEnabled(uint256 i) view returns (bool)',
  'function gate() view returns (GateLimits)',
  'function maxFloorRate() view returns (uint256)',
  'function term() view returns (uint256)',
  'function venusBlocksPerYear() view returns (uint256)',
  'function keeper() view returns (address)',
  'function vaultCount() view returns (uint256)',
]);

export const vaultAbi = parseAbi([
  'struct Status { uint256 total; uint256 stockUsd; uint256 safeUsd; uint256 price; uint256 floor; uint256 target; uint256 breakDistance; uint256 floorRate; uint256 multiplier; uint256 cap; uint256 promised; uint256 deposited; uint256 maturity; uint256 marketIndex; uint8 gateCode; }',
  'function status() view returns (Status)',
  'function saver() view returns (address)',
  'function stockId() view returns (uint256)',
  'function promiseBps() view returns (uint256)',
  'event Rebalanced(uint8 reason, int256 deltaUsd, uint256 price, uint256 total, uint256 floor, uint256 target, uint256 multiplier)',
  'event MultiplierSet(address indexed by, uint256 multiplier)',
  'event PulledOut(uint256 indexed marketIndex, uint8 gateCode)',
  'event MovedSafeLeg(uint256 indexed from, uint256 indexed to, uint256 amount)',
  'event Deposited(address indexed from, uint256 amount, uint256 promised)',
  'event Withdrawn(uint256 share, uint256 usdtOut, uint256 promisedLeft)',
]);

const vTokenAbi = parseAbi([
  'function supplyRatePerBlock() view returns (uint256)',
  'function getCash() view returns (uint256)',
  'function totalBorrows() view returns (uint256)',
  'function totalReserves() view returns (uint256)',
  'function comptroller() view returns (address)',
]);
const comptrollerAbi = parseAbi(['function actionPaused(address market, uint8 action) view returns (bool)']);
const aaveAbi = parseAbi([
  'struct ReserveData { uint256 configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; }',
  'function getReserveData(address asset) view returns (ReserveData)',
]);
const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)']);
const oracleAbi = parseAbi(['function getPrice(address asset) view returns (uint256)']);

export const GATE_CODES = ['healthy', 'paused', 'not enough cash to withdraw', 'too much of it lent out', 'USDT price feed off'];

export interface SafeMarket {
  index: number;
  name: 'Venus' | 'Aave';
  rate: number; // yearly, fraction
  utilization: number;
  cashUsd: number;
  gateCode: number;
}

/** Every enabled lending market, checked with the same health gate the vault runs (SafeLeg.check). */
export async function safeMarkets(sizeUsd: number): Promise<SafeMarket[]> {
  const [count, gate, blocksPerYear, usdtPrice] = await Promise.all([
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'marketCount' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'gate' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'venusBlocksPerYear' }),
    client.readContract({ address: VENUS_ORACLE, abi: oracleAbi, functionName: 'getPrice', args: [USDT] }).catch(() => null),
  ]);
  const out: SafeMarket[] = [];
  for (let i = 1; i <= Number(count); i++) {
    const [enabled, m] = await Promise.all([
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'marketEnabled', args: [BigInt(i)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'market', args: [BigInt(i)] }),
    ]);
    if (!enabled) continue;
    let rate = 0n, cash = 0n, borrows = 0n, supplied = 0n, code = 0;
    if (m.kind === 1) {
      const [r, c, b, res, comp] = await Promise.all([
        client.readContract({ address: m.target, abi: vTokenAbi, functionName: 'supplyRatePerBlock' }),
        client.readContract({ address: m.target, abi: vTokenAbi, functionName: 'getCash' }),
        client.readContract({ address: m.target, abi: vTokenAbi, functionName: 'totalBorrows' }),
        client.readContract({ address: m.target, abi: vTokenAbi, functionName: 'totalReserves' }),
        client.readContract({ address: m.target, abi: vTokenAbi, functionName: 'comptroller' }),
      ]);
      const [p0, p1] = await Promise.all([0, 1].map((a) =>
        client.readContract({ address: comp, abi: comptrollerAbi, functionName: 'actionPaused', args: [m.target, a] })));
      rate = r * blocksPerYear;
      cash = c; borrows = b; supplied = c + b > res ? c + b - res : 0n;
      if (p0 || p1) code = 1;
    } else if (m.kind === 2) {
      const rd = await client.readContract({ address: m.target, abi: aaveAbi, functionName: 'getReserveData', args: [USDT] });
      const cfg = rd.configuration;
      const active = ((cfg >> 56n) & 1n) === 1n, frozen = ((cfg >> 57n) & 1n) === 1n, paused = ((cfg >> 60n) & 1n) === 1n;
      rate = rd.currentLiquidityRate / 10n ** 9n;
      [cash, borrows] = await Promise.all([
        client.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [m.receipt] }),
        client.readContract({ address: m.debt, abi: erc20Abi, functionName: 'totalSupply' }),
      ]);
      supplied = cash + borrows;
      if (!active || frozen || paused) code = 1;
    } else continue;
    const utilization = supplied > 0n ? Number((borrows * WAD) / supplied) / 1e18 : 0;
    if (code === 0 && utilization > fromWad(gate.maxUtilization)) code = 3;
    if (code === 0 && fromWad(cash) < sizeUsd * Number(gate.minCashMultiple)) code = 2;
    if (code === 0 && (usdtPrice === null || Math.abs(fromWad(usdtPrice) - 1) > fromWad(gate.maxPegDeviation))) code = 4;
    out.push({ index: i, name: m.kind === 1 ? 'Venus' : 'Aave', rate: fromWad(rate), utilization, cashUsd: fromWad(cash), gateCode: code });
  }
  return out;
}

/** The market a new vault would start in: the best rate among those passing the gate (PlinthVault._guardSafeLeg). */
export function bestMarket(ms: SafeMarket[]): SafeMarket | null {
  return ms.filter((m) => m.gateCode === 0).reduce<SafeMarket | null>((a, b) => (!a || b.rate > a.rate ? b : a), null);
}

export interface ListedStock { id: number; token: Address; cap: number; enabled: boolean }

export async function listedStocks(): Promise<ListedStock[]> {
  const n = Number(await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockCount' }));
  return Promise.all(Array.from({ length: n }, async (_, id) => {
    const [cfg, cap, enabled] = await Promise.all([
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stock', args: [BigInt(id)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'liveCap', args: [BigInt(id)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockEnabled', args: [BigInt(id)] }),
    ]);
    return { id, token: cfg.token, cap: fromWad(cap), enabled };
  }));
}

export async function factoryTerms() {
  const [maxFloorRate, term] = await Promise.all([
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'maxFloorRate' }),
    client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'term' }),
  ]);
  return { maxFloorRate: fromWad(maxFloorRate), termSeconds: Number(term) };
}

/** The keeper the factory trusts right now (the owner can move it). */
export const currentKeeper = () => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'keeper' });

export async function vaultStatus(vault: Address) {
  const [s, stockId, saver] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'status' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'stockId' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'saver' }),
  ]);
  return { s, stockId: Number(stockId), saver };
}
