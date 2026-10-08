// Vault events in plain words, built from each event's own on-chain fields (see relay/api/vault-log.js).
import { usd } from './format';

export interface LogRow {
  event: string; block: number; tx: string; time?: number; detail: string; logIndex?: number;
  args?: Record<string, string | number | boolean>;
}
export interface Plain { tag: string; tone: 'you' | 'buy' | 'sell' | 'safe' | 'risk' | 'alert'; text: string; row: LogRow }

const MARKETS = ['cash in the vault', 'Venus', 'Aave'];
const usdOf = (x: unknown) => usd(Math.abs(Number(BigInt(String(x ?? 0)))) / 1e18, 2);
const num = (x: unknown) => Number(BigInt(String(x ?? 0))) / 1e18;
const market = (i: unknown) => MARKETS[Number(i)] ?? `market ${i}`;

/** Newest first in, newest first out. A rebalance and its trade share a transaction and read as one line. */
export function humanize(rows: LogRow[], stock: string, cap?: number): Plain[] {
  const out: Plain[] = [];
  const reasonByTx = new Map<string, number>();
  for (const r of rows) if (r.event === 'Rebalanced' && r.args) reasonByTx.set(r.tx, Number(r.args.reason));
  const tradedTx = new Set(rows.filter((r) => r.event === 'Traded').map((r) => r.tx));
  const txOf = (ev: string[]) => new Set(rows.filter((r) => ev.includes(r.event)).map((r) => r.tx));
  const depositTx = txOf(['Deposited', 'Rolled']);
  const withdrawTx = txOf(['Withdrawn', 'WithdrawnInKind']);
  rows.forEach((r, i) => {
    const a = r.args ?? {};
    const push = (tag: string, tone: Plain['tone'], text: string) => out.push({ tag, tone, text, row: r });
    switch (r.event) {
      case 'Deposited': return push('Deposit', 'you', `You put in ${usdOf(a.amount)}. Floor at 12 months: ${usdOf(a.promised)}.`);
      case 'Withdrawn': {
        const share = num(a.share) * 100;
        return push('Withdrawal', 'you', share >= 99.95 ? `You withdrew everything: ${usdOf(a.usdtOut)}.` : `You withdrew ${Math.abs(share - Math.round(share)) < 0.05 ? Math.round(share) : share.toFixed(1)}%: ${usdOf(a.usdtOut)}.`);
      }
      case 'WithdrawnInKind': return push('Withdrawal', 'you', `You withdrew ${(num(a.share) * 100).toFixed(0)}% as the tokens themselves.`);
      case 'Traded': {
        const cushionGone = reasonByTx.get(r.tx) === 2;
        if (a.buy && depositTx.has(r.tx)) return push('Bought', 'buy', `Bought ${usdOf(a.usdtAmount)} of ${stock} to start: this is the part that rides the stock.`);
        if (!a.buy && withdrawTx.has(r.tx)) return push('Sold', 'you', `Sold ${usdOf(a.usdtAmount)} of ${stock} to pay out your withdrawal.`);
        if (a.buy) return push('Bought', 'buy', `Bought ${usdOf(a.usdtAmount)} of ${stock}: the cushion above your floor grew, so more can ride the stock.`);
        return push('Sold', 'sell', cushionGone
          ? `Sold ${usdOf(a.usdtAmount)} of ${stock} and moved everything to safety: the cushion was used up.`
          : `Sold ${usdOf(a.usdtAmount)} of ${stock} to move toward safety after it fell.`);
      }
      case 'Rebalanced': {
        if (tradedTx.has(r.tx)) return undefined;
        // Vaults before v3 emit no Traded event, so the rebalance itself says what it moved.
        const reason = Number(a.reason), delta = num(a.deltaUsd);
        if (reason === 0) return push('Checked', 'safe', 'Checked the mix: no trade needed.');
        if (reason === 3) return push('Checked', 'safe', 'Checked the mix: the change was too small to trade.');
        if (reason === 2) return push('Sold', 'sell', `Moved everything to safety: the cushion was used up.`);
        return delta >= 0
          ? push('Bought', 'buy', `Rebalanced: bought about ${usdOf(a.deltaUsd)} of ${stock}.`)
          : push('Sold', 'sell', `Rebalanced: sold about ${usdOf(a.deltaUsd)} of ${stock} to move toward safety.`);
      }
      case 'MovedSafeLeg': return push('Safe part', 'safe', Number(a.from) === 0
        ? `Lent ${usdOf(a.amount)} on ${market(a.to)} to earn interest.`
        : `Moved ${usdOf(a.amount)} from ${market(a.from)} to ${market(a.to)}.`);
      case 'MultiplierSet': {
        const now = num(a.multiplier);
        const older = rows.slice(i + 1).find((x) => x.event === 'MultiplierSet');
        const before = older ? num(older.args?.multiplier) : cap;
        if (before !== undefined && now < before) return push('Risk cut', 'risk', `The agent lowered how much rides ${stock} (multiplier ${before} to ${now}) to cut risk.`);
        if (before !== undefined && now > before) return push('Risk back', 'risk', `The agent raised it back (multiplier ${before} to ${now}).`);
        return push('Risk level', 'risk', `Multiplier set to ${now}.`);
      }
      case 'PulledOut': return push('Alert', 'alert', `Pulled the safe part out of ${market(a.marketIndex)}: it failed a health check.`);
      case 'Impaired': return push('Alert', 'alert', `${market(a.marketIndex)} would not pay out. Until it does, the vault only sells ${stock}, never buys.`);
      case 'SupplyRefused': return push('Alert', 'alert', `${market(a.marketIndex)} refused ${usdOf(a.amount)}; it stays as cash in the vault.`);
      case 'HeldAside': return push('Held aside', 'you', `${usdOf(a.amount)} above the vault's limit was set aside, to go back to you.`);
      case 'ExitStarted': return push('Exit', 'you', `You started leaving in steps: ${stock} is sold in chunks.`);
      case 'ExitCancelled': return push('Exit', 'you', 'You cancelled the staged exit.');
      case 'Rolled': return push('New term', 'you', `Rolled into a new 12 months. Floor: ${usdOf(a.promised)}.`);
      default: return push(r.event, 'safe', r.detail);
    }
  });
  return out;
}
