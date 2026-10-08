// Live reads from BSC mainnet. Every number the app shows comes from here or from a sourced data file.
import { createPublicClient, fallback, http, parseAbi, type Address } from 'viem';
import { bsc } from 'viem/chains';

// The live factory (v3) and demo vault; VITE_FACTORY and VITE_DEMO_VAULT override them at build time.
export const FACTORY_V1: Address = '0x57AB13A70d0BC7983196014b86D632eCAfD4b96f';
export const FACTORY: Address = (import.meta.env.VITE_FACTORY as Address | undefined) ?? '0x271cb3B56E133cd3488AB31e99766A288bC8DCe5';
export const USDT: Address = '0x55d398326f99059fF775485246999027B3197955';
export const VENUS_ORACLE: Address = '0x6592b5DE802159F3E74B2486b091D11a8256ab8A';
export const DEMO_VAULT: Address = (import.meta.env.VITE_DEMO_VAULT as Address | undefined) ?? '0xF0FB407210944A577949eA7Cc3031B542740B5B2';
export const RELAY = 'https://plinth-relay.vercel.app';
export const BSCSCAN = 'https://bscscan.com';

export const client = createPublicClient({
  chain: bsc,
  // Free public nodes rate limit busy visitors; four sources, the last one Plinth's own relay, so a page never sits waiting.
  transport: fallback([
    http('https://bsc-dataseed.bnbchain.org', { timeout: 8_000 }),
    http('https://bsc-rpc.publicnode.com', { timeout: 8_000 }),
    http('https://bsc-dataseed1.defibit.io', { timeout: 8_000 }),
    http('https://plinth-relay.vercel.app/api/rpc', { timeout: 12_000 }),
  ]),
  batch: { multicall: true },
});

const WAD = 10n ** 18n;
export const fromWad = (x: bigint) => Number(x) / 1e18;

export const factoryAbi = parseAbi([
  'struct StockConfig { address token; address pool; address router; uint24 fee; bool pancake; bool venusPriced; uint32 twapWindow; uint64 cap; uint64 band; uint64 maxSlippage; uint32 fastWindow; uint128 maxTrade; uint128 maxVault; }',
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
  'function minOpen() view returns (uint256)',
  'event VaultOpened(address indexed saver, address indexed vault, uint256 indexed stockId, uint256 amount, uint256 promiseBps)',
]);

const STOCK_CONFIG = 'struct StockConfig { address token; address pool; address router; uint24 fee; bool pancake; bool venusPriced; uint32 twapWindow; uint64 cap; uint64 band; uint64 maxSlippage; uint32 fastWindow; uint128 maxTrade; uint128 maxVault; }';

export const vaultAbi = parseAbi([
  'struct Status { uint256 total; uint256 stockUsd; uint256 safeUsd; uint256 price; uint256 slowPrice; uint256 fastPrice; uint256 floor; uint256 target; uint256 breakDistance; uint256 floorRate; uint256 multiplier; uint256 cap; uint256 promised; uint256 deposited; uint256 maturity; uint256 marketIndex; uint8 gateCode; uint256 nextRaiseAt; uint256 idleSince; uint256 excess; bool impaired; bool exiting; }',
  'function status() view returns (Status)',
  STOCK_CONFIG,
  'function stock() view returns (StockConfig)',
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

/** v2 vaults (factory 0x6Dc3…5906): no excess, impaired or exiting fields. */
const vaultAbiV2 = parseAbi([
  'struct Status { uint256 total; uint256 stockUsd; uint256 safeUsd; uint256 price; uint256 slowPrice; uint256 fastPrice; uint256 floor; uint256 target; uint256 breakDistance; uint256 floorRate; uint256 multiplier; uint256 cap; uint256 promised; uint256 deposited; uint256 maturity; uint256 marketIndex; uint8 gateCode; uint256 nextRaiseAt; uint256 idleSince; }',
  'function status() view returns (Status)',
]);

/** v1 vaults (factory 0x57AB…b96f) have a shorter Status and StockConfig. */
const vaultAbiV1 = parseAbi([
  'struct Status { uint256 total; uint256 stockUsd; uint256 safeUsd; uint256 price; uint256 floor; uint256 target; uint256 breakDistance; uint256 floorRate; uint256 multiplier; uint256 cap; uint256 promised; uint256 deposited; uint256 maturity; uint256 marketIndex; uint8 gateCode; }',
  'function status() view returns (Status)',
  'struct StockConfig { address token; address pool; address router; uint24 fee; bool pancake; bool venusPriced; uint32 twapWindow; uint64 cap; uint64 band; uint64 maxSlippage; }',
  'function stock() view returns (StockConfig)',
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

export interface ListedStock { id: number; token: Address; cap: number; enabled: boolean; fee: number; pancake: boolean }

export async function listedStocks(): Promise<ListedStock[]> {
  const n = Number(await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockCount' }));
  return Promise.all(Array.from({ length: n }, async (_, id) => {
    const [cfg, cap, enabled] = await Promise.all([
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stock', args: [BigInt(id)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'liveCap', args: [BigInt(id)] }),
      client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'stockEnabled', args: [BigInt(id)] }),
    ]);
    return { id, token: cfg.token, cap: fromWad(cap), enabled, fee: cfg.fee, pancake: cfg.pancake };
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

export interface VaultStock { token: Address; fee: number; pancake: boolean; maxSlippage: number; maxTrade: number | null; maxVault: number | null }

/** One vault, read live. Reads v3, and falls back to v2's and v1's shorter layouts (longest first, so a shorter
 *  layout never misreads a longer one). */
export async function vaultStatus(vault: Address) {
  const [stockId, saver] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'stockId' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'saver' }),
  ]);
  try {
    const [s, cfg] = await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'status' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'stock' }),
    ]);
    const stock: VaultStock = { token: cfg.token, fee: cfg.fee, pancake: cfg.pancake, maxSlippage: fromWad(cfg.maxSlippage), maxTrade: fromWad(cfg.maxTrade), maxVault: fromWad(cfg.maxVault) };
    return { s, stock, stockId: Number(stockId), saver, version: 3 as 1 | 2 | 3 };
  } catch { /* not v3 */ }
  try {
    const [s2, cfg] = await Promise.all([
      client.readContract({ address: vault, abi: vaultAbiV2, functionName: 'status' }),
      client.readContract({ address: vault, abi: vaultAbi, functionName: 'stock' }),
    ]);
    const s = { ...s2, excess: 0n, impaired: false, exiting: false };
    const stock: VaultStock = { token: cfg.token, fee: cfg.fee, pancake: cfg.pancake, maxSlippage: fromWad(cfg.maxSlippage), maxTrade: fromWad(cfg.maxTrade), maxVault: fromWad(cfg.maxVault) };
    return { s, stock, stockId: Number(stockId), saver, version: 2 as 1 | 2 | 3 };
  } catch {
    const [s1, cfg] = await Promise.all([
      client.readContract({ address: vault, abi: vaultAbiV1, functionName: 'status' }),
      client.readContract({ address: vault, abi: vaultAbiV1, functionName: 'stock' }),
    ]);
    const s = { ...s1, slowPrice: s1.price, fastPrice: s1.price, nextRaiseAt: 0n, idleSince: 0n, excess: 0n, impaired: false, exiting: false };
    const stock: VaultStock = { token: cfg.token, fee: cfg.fee, pancake: cfg.pancake, maxSlippage: fromWad(cfg.maxSlippage), maxTrade: null, maxVault: null };
    return { s, stock, stockId: Number(stockId), saver, version: 1 as 1 | 2 | 3 };
  }
}

/** Factory limits for new vaults: smallest first deposit and, per stock, the most one vault may hold. */
export async function openLimits(stockId: number): Promise<{ minOpen: number; maxVault: number | null }> {
  const minOpen = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'minOpen' }).then(fromWad).catch(() => 0);
  const maxVault = await client
    .readContract({ address: FACTORY, abi: parseAbi([STOCK_CONFIG, 'function stock(uint256 id) view returns (StockConfig)']), functionName: 'stock', args: [BigInt(stockId)] })
    .then((c) => fromWad(c.maxVault))
    .catch(() => null);
  return { minOpen, maxVault };
}

// ---------------------------------------------------------------- Binance Web3 API (through the relay)

async function web3Get(path: string, params: Record<string, string>) {
  const r = await fetch(`${RELAY}/api/web3?${new URLSearchParams({ path, ...params })}`);
  const j = await r.json();
  if (j?.code !== 0) throw new Error(`Web3 API ${path}: ${j?.code ?? r.status} ${j?.msg ?? j?.error ?? ''}`);
  return j.data;
}

async function web3Post(path: string, body: unknown) {
  const r = await fetch(`${RELAY}/api/web3`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, body }) });
  const j = await r.json();
  if (j?.code !== 0) throw new Error(`Web3 API ${path}: ${j?.code ?? r.status} ${j?.msg ?? j?.error ?? ''}`);
  return j.data;
}

/** RWA Data API: the bStock's on-chain price and the underlying stock's reference price. */
export async function rwaPrice(token: Address): Promise<{ tokenPrice: number; referencePrice: number } | null> {
  const d = await web3Get('/api/v1/dex/market/rwa/price', { binanceChainId: '56', tokenContractAddresses: token });
  const row = Array.isArray(d) ? d[0] : d?.list?.[0] ?? d;
  if (!row) return null;
  return { tokenPrice: Number(row.tokenPrice), referencePrice: Number(row.referencePrice) };
}

export interface DefiProduct { protocol: string; protocolId: string; apy: number; tvl: number; allowed: boolean }

/** DeFi Data API: every USDT earn product on BSC, ranked by TVL. Plinth may use only Venus core and Aave v3. */
export async function usdtEarnProducts(): Promise<DefiProduct[]> {
  const d = await web3Post('/api/v1/defi/data/investment/list', {
    investType: 'Earn', binanceChainId: '56', tokenAddressList: [USDT], sortField: 'tvl', sortDirection: 'DESC', page: 1, size: 20,
  });
  return (d?.list ?? []).map((x: any) => ({
    protocol: x.protocolName, protocolId: x.defiProtocolId, apy: Number(x.apyBps) / 10_000, tvl: Number(x.tvl),
    allowed: x.defiProtocolId === 'venus' || x.defiProtocolId === 'aave3',
  }));
}

/** Trading API: what selling `tokens` of the bStock would return in USDT right now, best route. */
export async function sellQuote(token: Address, tokens: number): Promise<{ usdtOut: number; cost: number; vendor: string; impact: number } | null> {
  if (!(tokens > 0)) return null;
  const amount = BigInt(Math.floor(tokens * 1e6)) * 10n ** 12n;
  const d = await web3Get('/api/v1/dex/aggregator/quote', {
    binanceChainId: '56', fromTokenAddress: token, toTokenAddress: USDT, amount: amount.toString(),
  });
  const q = Array.isArray(d) ? d[0] : d;
  if (!q?.toTokenAmount) return null;
  const usdtOut = Number(BigInt(q.toTokenAmount)) / 1e18;
  // Cost against the quote's own mid price, so a small gap between price sources does not read as a cost or a gain.
  const mid = Number(q.fromToken?.tokenUnitPrice ?? 0) * tokens;
  return { usdtOut, cost: mid > 0 ? Math.max(0, mid - usdtOut) : 0, vendor: q.vendorName, impact: Number(q.priceImpactPercent ?? 0) };
}

// ---------------------------------------------------------------- the vault's own route

const QUOTER = { pancake: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997', uniswap: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077' } as const;
const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);
export interface Route { token: Address; fee: number; pancake: boolean }
export const routeName = (r: Route) => `${r.pancake ? 'PancakeSwap' : 'Uniswap'} v3 ${(r.fee / 10_000).toFixed(2)}% pool`;

/** What the vault itself would get: an exact-input quote on the same pool and fee tier its swaps use. */
async function quote(r: Route, tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: r.pancake ? QUOTER.pancake : QUOTER.uniswap, abi: quoterAbi, functionName: 'quoteExactInputSingle',
    args: [{ tokenIn, tokenOut, amountIn, fee: r.fee, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

/** USDT out for selling `tokens` of the stock through the vault's route. */
export async function routeSell(r: Route, tokens: number): Promise<number> {
  if (!(tokens > 0)) return 0;
  return fromWad(await quote(r, r.token, USDT, BigInt(Math.floor(tokens * 1e12)) * 10n ** 6n));
}

/** A real round trip on the vault's route: buy with `usd`, then sell what that bought. Returns the cost in USDT. */
export async function routeRoundTrip(r: Route, usd: number): Promise<number> {
  if (!(usd > 0)) return 0;
  const tokens = await quote(r, USDT, r.token, BigInt(Math.floor(usd * 1e6)) * 10n ** 12n);
  const back = await quote(r, r.token, USDT, tokens);
  return usd - fromWad(back);
}

/** Wallet API: what a wallet holds on BSC, narrowed to USDT and the listed bStocks (wallets also hold airdropped junk). */
export async function walletHoldings(address: Address, listed: { sym: string; token: string }[]) {
  const d = await web3Get('/api/v1/dex/balance/all-token-balances-by-address', { address, chains: '56', pageSize: '100' });
  const assets: any[] = (Array.isArray(d) ? d[0]?.tokenAssets : d?.tokenAssets) ?? [];
  const by = new Map(assets.map((a) => [String(a.tokenContractAddress).toLowerCase(), a]));
  const usdt = Number(by.get(USDT.toLowerCase())?.balance ?? 0);
  const stocks = listed.flatMap((l) => {
    const a = by.get(l.token.toLowerCase());
    const amount = Number(a?.balance ?? 0);
    return amount > 0 ? [{ sym: l.sym, amount, usd: amount * Number(a.tokenPrice ?? 0) }] : [];
  });
  return { usdt, stocks };
}
