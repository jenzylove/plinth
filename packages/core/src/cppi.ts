// Plinth core math. Pure functions, no network. The vault contract mirrors these exactly.

export const YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface VaultState {
  /** Value held in the stock leg, in USD. */
  stock: number;
  /** Value held in the safe leg, in USD. */
  safe: number;
  /** Amount promised at maturity, in USD. */
  promise: number;
  /** Seconds left until maturity. */
  secondsLeft: number;
  /** Annual rate the safe leg earns, as a fraction (0.035 = 3.5%). */
  rate: number;
  /** Multiplier currently allowed for this stock. */
  multiplier: number;
}

/** Value today of the promise paid at maturity, discounted at the safe rate. */
export function floorValue(promise: number, rate: number, secondsLeft: number): number {
  if (secondsLeft <= 0) return promise;
  return promise / Math.pow(1 + rate, secondsLeft / YEAR_SECONDS);
}

export function totalValue(s: Pick<VaultState, 'stock' | 'safe'>): number {
  return s.stock + s.safe;
}

/** Cushion: how much the vault can lose before it touches the floor. Never negative. */
export function cushion(s: VaultState): number {
  return Math.max(0, totalValue(s) - floorValue(s.promise, s.rate, s.secondsLeft));
}

/** Target stock exposure: multiplier times cushion, never more than the whole vault (no leverage). */
export function targetStock(s: VaultState): number {
  return Math.min(totalValue(s), s.multiplier * cushion(s));
}

/**
 * Break distance: the single instant drop in the stock that would push the vault below the floor.
 * Returns a fraction (0.25 = a 25% drop). Infinity when nothing is held in stock.
 */
export function breakDistance(s: VaultState): number {
  if (s.stock <= 0) return Infinity;
  return cushion(s) / s.stock;
}

/**
 * Worst-case exit value if the saver withdraws right now and the stock is then hit by an
 * instant drop equal to the largest move the multiplier is sized for. The vault never pays
 * less than today's floor value in that case.
 */
export function worstCaseExitNow(s: VaultState): number {
  return floorValue(s.promise, s.rate, s.secondsLeft);
}

export interface RebalanceDecision {
  trade: boolean;
  /** Positive: buy stock with this much USD. Negative: sell this much USD of stock. */
  deltaUsd: number;
  target: number;
  reason: 'within-band' | 'drift' | 'cushion-gone' | 'below-min-trade';
}

/**
 * Decide whether to trade. Trades only when the stock leg drifts more than `band` (fraction of
 * target) from target, or when the cushion is gone and stock must go to zero. Tiny trades are skipped.
 */
export function rebalance(s: VaultState, band = 0.1, minTradeUsd = 1): RebalanceDecision {
  const target = targetStock(s);
  const delta = target - s.stock;
  if (target === 0 && s.stock > 0) {
    return { trade: true, deltaUsd: -s.stock, target, reason: 'cushion-gone' };
  }
  if (Math.abs(delta) < minTradeUsd) {
    return { trade: false, deltaUsd: 0, target, reason: 'below-min-trade' };
  }
  const drift = target === 0 ? Infinity : Math.abs(delta) / target;
  if (drift <= band) return { trade: false, deltaUsd: 0, target, reason: 'within-band' };
  return { trade: true, deltaUsd: delta, target, reason: 'drift' };
}

/** Exposure at deposit time for a given promise fraction (1 = get your money back). */
export function startingExposure(
  deposit: number,
  promiseFraction: number,
  rate: number,
  multiplier: number,
  termSeconds = YEAR_SECONDS,
): number {
  const promise = deposit * promiseFraction;
  return targetStock({ stock: 0, safe: deposit, promise, secondsLeft: termSeconds, rate, multiplier });
}
