export const usd = (x: number, digits = 0) =>
  '$' + x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const pct = (x: number, digits = 1) => (x * 100).toFixed(digits) + '%';
/** WAD values from data files arrive as numbers or decimal strings. */
export const wad = (x: string | number | bigint) => Number(BigInt(x)) / 1e18;
export const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
