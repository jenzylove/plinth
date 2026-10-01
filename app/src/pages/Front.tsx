import { useEffect, useMemo, useState } from 'react';
import { floorValue, startingExposure, YEAR_SECONDS } from '@core/cppi';
import { bestMarket, factoryTerms, FACTORY, GATE_CODES, listedStocks, safeMarkets, type ListedStock, type SafeMarket } from '../chain';
import { calibration, calibrationOf, NAMES, symOf } from '../data';
import { pct, usd } from '../format';
import { PlinthFigure } from '../Plinth';

const FLOORS = [
  { bps: 10_000, label: 'Get my money back' },
  { bps: 9_500, label: '95% back' },
  { bps: 9_000, label: '90% back' },
];

interface Live { markets: SafeMarket[]; maxFloorRate: number; termSeconds: number; stocks: (ListedStock & { sym: string })[] }

export function Front() {
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sym, setSym] = useState('NVDA');
  const [bps, setBps] = useState(10_000);
  const [amount, setAmount] = useState(1000);
  const [showDeposit, setShowDeposit] = useState(false);

  useEffect(() => {
    Promise.all([safeMarkets(amount), factoryTerms(), listedStocks()])
      .then(([markets, t, ls]) => setLive({
        markets, ...t,
        stocks: ls.filter((s) => s.enabled).map((s) => ({ ...s, sym: symOf(s.token) ?? '' })).filter((s) => s.sym),
      }))
      .catch((e) => setError(String(e?.shortMessage ?? e?.message ?? e)));
  }, []);

  const stock = live?.stocks.find((s) => s.sym === sym);
  const market = live ? bestMarket(live.markets) : null;
  const cal = calibrationOf(sym);
  const name = NAMES[sym] ?? sym;

  const calc = useMemo(() => {
    if (!live || !stock) return null;
    // A vault with no market passing the gate waits in plain USDT, which earns nothing.
    const rate = Math.min(market?.rate ?? 0, live.maxFloorRate);
    const promise = (amount * bps) / 10_000;
    const floor = floorValue(promise, rate, live.termSeconds);
    const inStock = startingExposure(amount, bps / 10_000, rate, stock.cap, live.termSeconds);
    return { rate, promise, floor, inStock, months: Math.round((live.termSeconds / YEAR_SECONDS) * 12) };
  }, [live, stock, market, amount, bps]);

  const scale = amount / 1000; // the backtest is per $1,000

  return (
    <section className="front">
      <div className="hero">
        <div className="hero-text">
          <p className="kicker">Capital-protected savings on tokenized US stocks · BSC mainnet</p>
          <h1>Get your money back at 12 months, plus the upside of a US stock.</h1>

          <p className="sentence">
            Put{' '}
            <span className="field money">$<input aria-label="Amount in USDT" type="number" min={10} step={10} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} /></span>{' '}
            into{' '}
            <span className="field">
              <select aria-label="Stock" value={sym} onChange={(e) => setSym(e.target.value)}>
                {(live?.stocks ?? [{ sym: 'NVDA' }]).map((s) => <option key={s.sym} value={s.sym}>{NAMES[s.sym] ?? s.sym}</option>)}
              </select>
            </span>{' '}
            and{' '}
            <span className="field">
              <select aria-label="Floor" value={bps} onChange={(e) => setBps(Number(e.target.value))}>
                {FLOORS.map((f) => <option key={f.bps} value={f.bps}>{f.label.toLowerCase()}</option>)}
              </select>
            </span>.
          </p>

          {error && <p className="fail">Could not read BSC right now: {error}. Nothing below is a guess, so nothing is shown.</p>}
          {!error && !calc && <p className="muted">Reading live rates and caps from BSC…</p>}
        </div>
        {calc && (
          <PlinthFigure
            total={amount}
            floor={calc.floor}
            stock={calc.inStock}
            breakDistance={calc.inStock > 0 ? (amount - calc.floor) / calc.inStock : null}
            label={name}
          />
        )}
      </div>

      {calc && stock && (
        <div className="answer">
          <p className="lead">
            <strong>{usd(calc.inStock)}</strong> of your {usd(amount)} starts working in {name}. It grows as {name} rises.
          </p>
          <p>
            If {name} falls, Plinth moves your money to safety on its own. At {calc.months} months you get at least{' '}
            <strong>{usd(calc.promise)}</strong>.
          </p>
          <p>
            Leave early any time. If you left today, the worst case would be <strong>{usd(calc.floor)}</strong>.
          </p>
          {bps === 10_000 && cal ? (
            <p>
              Tested on every 12-month window of the last 10 years ({cal.windows} windows from {cal.from}):{' '}
              lowest result {usd(cal.min * scale, 2)}
              {cal.breaches > 0 && <>, and {cal.breaches} windows ended more than 50 cents per $1,000 below the floor</>}.
              Typical result {usd(cal.median * scale)}. Best {usd(cal.max * scale)}. Beat plain lending {pct(cal.beatSafeOnly, 0)} of the time.
            </p>
          ) : (
            <p className="muted">The 10-year test covers the 100% floor. See <a href="/proof">Proof</a>.</p>
          )}
          <button className="primary" onClick={() => setShowDeposit(!showDeposit)}>Deposit</button>

          <dl className="sources">
            <div><dt>Safe leg now</dt><dd>{market ? <>{market.name}, {pct(market.rate, 2)} a year, {pct(market.utilization)} lent out, {GATE_CODES[market.gateCode]}</> : 'no lending market passes the health gate: funds would wait in USDT'}</dd></div>
            <div><dt>Floor assumes</dt><dd>{pct(calc.rate, 2)} a year (the safe leg's rate, capped at {pct(live!.maxFloorRate, 0)})</dd></div>
            <div><dt>Multiplier</dt><dd>{stock.cap} for {name}, the highest with no floor breaks over 10 years (read from the factory)</dd></div>
            <div><dt>Backtest</dt><dd>{calibration.source}, generated {calibration.generated.slice(0, 10)}</dd></div>
          </dl>

          {showDeposit && (
            <div className="deposit">
              <h2>Deposit from your Binance Agentic Wallet</h2>
              <p>Plinth runs on BSC mainnet. A deposit is two contract calls from your wallet (developer mode, preview first):</p>
              <ol>
                <li>Approve USDT <code>0x55d3…7955</code> for the factory <code>{FACTORY}</code>, amount {amount}.</li>
                <li>Call <code>open({stock.id}, {bps}, {amount}e18)</code> on the factory. Your vault is created and the money goes to work in the same transaction.</li>
              </ol>
              <p className="muted">Your vault is a contract only you can withdraw from. The keeper can lower risk or rebalance; it can never move your money anywhere else.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
