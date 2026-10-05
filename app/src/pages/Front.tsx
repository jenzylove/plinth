import { useEffect, useMemo, useState } from 'react';
import { floorValue, startingExposure, YEAR_SECONDS } from '@core/cppi';
import {
  BSCSCAN, DEMO_VAULT, FACTORY, GATE_CODES, RELAY, bestMarket, currentKeeper, factoryTerms, listedStocks, rwaPrice, safeMarkets,
  routeName, routeRoundTrip, usdtEarnProducts, vaultStatus, type DefiProduct, type ListedStock, type SafeMarket,
} from '../chain';
import type { Address } from 'viem';
import { calibration, calibrationOf, gapOf, NAMES, replays, symOf } from '../data';
import { pct, short, usd, wad } from '../format';
import { CountUp, FillText, Reveal, useScrollProgress } from '../motion';
import { Deposit } from '../Deposit';

const FLOORS = [
  { bps: 10_000, label: 'get my money back' },
  { bps: 9_500, label: 'get 95% back' },
  { bps: 9_000, label: 'get 90% back' },
];

interface Live { markets: SafeMarket[]; maxFloorRate: number; termSeconds: number; stocks: (ListedStock & { sym: string })[] }
type VaultLive = Awaited<ReturnType<typeof vaultStatus>>;

const Shield = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" fill="currentColor" /></svg>
);
const Rise = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M4 16l5-5 4 3 7-7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Clock = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.6" fill="none" /><path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
);

export function Front() {
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultLive | null>(null);
  const [sym, setSym] = useState('NVDA');
  const [bps, setBps] = useState(10_000);
  const [amount, setAmount] = useState(1000);
  const [open, setOpen] = useState<number | null>(0);
  const [defi, setDefi] = useState<DefiProduct[] | null>(null);
  const [roundTrip, setRoundTrip] = useState<{ cost: number; route: string } | null>(null);

  useEffect(() => {
    Promise.all([safeMarkets(amount), factoryTerms(), listedStocks()])
      .then(([markets, t, ls]) => setLive({
        markets, ...t,
        stocks: ls.filter((s) => s.enabled).map((s) => ({ ...s, sym: symOf(s.token) ?? '' })).filter((s) => s.sym),
      }))
      .catch((e) => setError(String(e?.shortMessage ?? e?.message ?? e)));
    vaultStatus(DEMO_VAULT).then(setVault).catch(() => setVault(null));
    usdtEarnProducts().then(setDefi).catch(() => setDefi([]));
  }, []);
  // The health gate's cash check depends on the deposit size: re-run it for the amount typed (debounced).
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => safeMarkets(amount).then((markets) => setLive((l) => (l ? { ...l, markets } : l))).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [amount]);

  const stock = live?.stocks.find((s) => s.sym === sym);
  const market = live ? bestMarket(live.markets) : null;
  const cal = calibrationOf(sym);
  const gap = gapOf(sym);
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

  // Leaving right after opening costs a round trip on the stock part: quote the buy, then the sale of exactly what it
  // bought, on the pool and fee tier the vault itself trades on. A stale answer never overwrites a newer one.
  useEffect(() => {
    setRoundTrip(null);
    if (!stock || !calc || calc.inStock <= 0) return;
    let alive = true;
    const t = setTimeout(() => {
      const route = { token: stock.token, fee: stock.fee, pancake: stock.pancake };
      routeRoundTrip(route, calc.inStock)
        .then((cost) => alive && setRoundTrip({ cost: Math.max(0, cost), route: routeName(route) }))
        .catch(() => { /* no quote: the tile says so */ });
    }, 700);
    return () => { alive = false; clearTimeout(t); };
  }, [stock?.token, calc?.inStock]);

  const scale = amount / 1000; // the backtest is per $1,000

  // The replay's headline: margin over the floor right after Nvidia's 2018 gap opened.
  const r18 = replays.results[0];
  const gapStep = replays.paths.paths[0].steps.findIndex((s: { date: string; kind: string }) => s.date === '2018-11-16' && s.kind === 'open');
  const plinthAtGap = wad(r18.plinthTotal[gapStep]) - wad(r18.floor[gapStep]);
  const bankAtGap = wad(r18.bankTotal[gapStep]) - wad(r18.floor[gapStep]);
  const cutAtGap = wad(r18.bankCutTotal[gapStep]) - wad(r18.floor[gapStep]);
  const bars = r18.plinthTotal.map(wad);
  const bLo = Math.min(...r18.floor.map(wad)) - 3, bHi = Math.max(...bars);

  const v = vault?.s;
  const n = (x: bigint) => Number(x) / 1e18;

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <h1 className="headline">
          <span className="w">Protect</span> <span className="w">your</span>{' '}
          <span className="dot red"><Shield /></span> <span className="w">money.</span>
          <br />
          <span className="w grey">Keep</span> <span className="w grey">the</span>{' '}
          <span className="dot yellow"><Rise /></span> <span className="w">upside.</span>
        </h1>
        <p className="sub">
          Deposit USDT, pick a stock and a floor: up to 100% of what you put in, at 12 months. An agent rebalances your
          money around the clock to defend that floor while part of it rides {name}. Defended by code, not guaranteed.
          Withdraw any time. Runs on BSC mainnet.
        </p>
        <div className="welcome">
          <span><i>1</i> Pick a stock and how much you want back</span>
          <span><i>2</i> Connect your wallet</span>
          <span><i>3</i> Deposit. Watch it live, withdraw any time</span>
        </div>

        <div className="calc card" id="start">
          <p className="sentence">
            Put{' '}
            <span className="field money">$<input aria-label="Amount in USDT" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) * 100) / 100 || 0))} /></span>{' '}
            into{' '}
            <span className="field">
              <select aria-label="Stock" value={sym} onChange={(e) => setSym(e.target.value)}>
                {(live?.stocks ?? [{ sym: 'NVDA' }]).map((s) => <option key={s.sym} value={s.sym}>{NAMES[s.sym] ?? s.sym}</option>)}
              </select>
            </span>{' '}
            and get <span className="field">{bps / 100}%</span> back
          </p>
          <div className="floor-slider">
            <span className="muted">More upside</span>
            <input
              type="range" min={9000} max={10000} step={500} value={bps} aria-label="How much you get back at 12 months"
              onChange={(e) => setBps(Number(e.target.value))}
              style={{ ['--p' as string]: `${(bps - 9000) / 10}%` }}
            />
            <span className="muted">More protection</span>
            <div className="ticks">{[...FLOORS].reverse().map((f) => <button key={f.bps} className={bps === f.bps ? 'on' : ''} onClick={() => setBps(f.bps)}>{f.bps / 100}%</button>)}</div>
          </div>
          {error && <p className="fail">Could not read BSC right now: {error}. Nothing is shown rather than a guess.</p>}
          {!error && !calc && <p className="muted">Reading live rates and caps from BSC…</p>}
          {calc && (
            <div className="calc-out">
              <div className="stat"><span>Works in {name}</span><strong><CountUp value={calc.inStock} format={(x) => usd(x)} /></strong></div>
              <div className="stat"><span>Floor at {calc.months} months</span><strong><CountUp value={calc.promise} format={(x) => usd(x)} /></strong>
                <small className="muted">the target the strategy defends; today's floor is {usd(calc.floor)}</small></div>
              <div className="stat"><span>Leave right after</span><strong>{roundTrip ? <CountUp value={amount - roundTrip.cost} format={(x) => usd(x, 2)} /> : '…'}</strong>
                <small className="muted">{roundTrip ? `buy and sell on the ${roundTrip.route} the vault uses, quoted now` : `quoting the vault's own pool`}</small></div>
            </div>
          )}
          {calc && (
            <p className="muted small conditions">
              The floor holds if the agent can trade before {name} falls more than the break distance, the lending market
              pays out, and USDT keeps its peg. Rates float: if they fall, the floor rises and less stays in {name}. It is
              defended by the contract's rules, with no insurer behind it.
            </p>
          )}
          {calc && <Deposit stockId={stock?.id} bps={bps} amount={amount} name={name} onAmount={setAmount} />}
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="how" id="how">
        <div className="split">
          <Reveal as="h2">Your money in two parts, and an agent that rebalances them around the clock.</Reveal>
          <Reveal as="p" delay={120} className="muted">
            The same method bank desks have sold for 40 years, with one change: tokenized stocks trade at 3am on a Sunday,
            so Plinth can move to safety when a bank desk cannot.
          </Reveal>
        </div>
        <div className="cards">
          <Reveal className="card step">
            <span className="tag yellow">1 · The safe part</span>
            <h3>Most of it earns interest, behind a health check.</h3>
            <p className="muted">
              Lent on {market?.name ?? 'Venus or Aave'} {market && <>at <b>{pct(market.rate, 2)}</b> a year, {pct(market.utilization)} lent out</>}.
              If a pool gets crowded or paused, the vault pulls out first.
              {defi && defi.length > 0 && <> The Binance DeFi API lists {defi.length} USDT products on BSC; Plinth uses only the {defi.filter((d) => d.allowed).length} plain lending markets.</>}
            </p>
            {calc && <div className="big"><CountUp value={amount - calc.inStock} format={(x) => usd(x)} /><small>of {usd(amount)}</small></div>}
          </Reveal>
          <Reveal className="card step" delay={120}>
            <span className="tag red">2 · The stock part</span>
            <h3>The rest rides {name}.</h3>
            <p className="muted">
              Sized so a single drop of {calc && calc.inStock > 0 ? <b>{pct((amount - calc.floor) / calc.inStock)}</b> : '–'} still leaves
              you above the floor. {gap && <>{name}'s worst overnight gap in 10 years was <b>{pct(gap.worstGap)}</b> ({gap.on}).</>}
            </p>
            {calc && <div className="big"><CountUp value={calc.inStock} format={(x) => usd(x)} /><small>in {name}</small></div>}
          </Reveal>
          <Reveal className="card step black" delay={240}>
            <span className="tag">3 · The keeper</span>
            <h3>Rebalances 24/7 and cuts risk before big news.</h3>
            <p>
              Before earnings and jobs reports it lowers the multiplier. It can never withdraw, and never raise risk above the cap.
            </p>
            <div className="big">{stock ? stock.cap : '–'}<small>{name}'s multiplier cap</small></div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ the big number */}
      <section className="proofband">
        <Reveal className="huge">
          <CountUp value={plinthAtGap} format={(x) => usd(x, 2)} />
        </Reveal>
        <Reveal className="huge-note" delay={150}>
          <p>
            <b>Above the floor</b> the morning Nvidia opened {pct(gap?.worstGap ?? -0.193)} on 2018-11-16, in a replay of
            the real contracts on a copy of BSC mainnet. A bank desk running the same method was {usd(bankAtGap, 2)} above;
            a desk making the same cut before the report, {usd(cutAtGap, 2)}.
          </p>
          <p className="muted">
            Most of the difference is the cut before earnings. Trading around the clock adds the rest, and on three months
            of real bStock prices it cost about nothing. <a href="/proof">See every step</a>.
          </p>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ scroll-filled line */}
      <section className="fill">
        <FillText
          text="Protect what you put in, and still"
          pill={`ride ${name}`}
          pillWords={(live?.stocks ?? []).filter((x) => x.sym !== sym).slice(0, 4).map((x) => `ride ${NAMES[x.sym] ?? x.sym}`)}
        />
      </section>

      {/* ------------------------------------------------------------ explainer */}
      <section className="explain">
        <div className="acc">
          <Reveal as="h2">What is going on here.</Reveal>
          {[
            ['A floor we defend, not a guarantee', `The floor today is your promise discounted at today's lending rate. The amount above it is the cushion, and only a multiple of the cushion goes into the stock (${stock && calc ? `for ${usd(amount)} in ${name} today: a ${usd(Math.max(0, amount - calc.floor))} cushion times multiplier ${stock.cap} is about ${usd(calc.inStock)} in stock` : 'multiplier times cushion'}). When the stock falls, the cushion shrinks and the agent sells toward safety, so the floor is reached only if the stock drops more than the break distance before anyone can trade. The safe part alone does not grow to the promise: the strategy relies on rebalancing in time, on liquidity in the pool and on the lending rate. Each stock's multiplier comes from its price history; the risks are a fall bigger and faster than any in that history, the lending pool, USDT's peg and the contract itself.`],
            ['Why 24/7 trading matters', `A bank desk can only sell when New York is open. bStocks keep trading at night and at weekends, and some falls happen there: META fell 11% and SanDisk 20% before the next open. The vault can sell during those hours. The same pools also print bad ticks (SPY at $1,086 for an hour against $750), so the vault never values the stock above a slow reference (Venus's feed or a 10-minute pool average), counts a fall from the 60-second average only once the live pool price confirms it, and ignores a hole that has recovered. On a fork, holes of 5 to 60 seconds that recovered moved nothing; a 2-minute one trimmed a little. A crash that lasts is sold within about a minute.`],
            ['Where the safe money sits', `Only Venus core and Aave stablecoin markets, no CeDeFi, no synthetic dollars, even where the yield is higher. Before every move the vault checks cash, how much is lent out (92% at most), pauses and the USDT price feed. If no pool passes, the money waits in USDT and the floor keeps the last healthy rate for up to 7 days.`],
            ['What you can do any time', `Withdraw at today's value, or, if a pool or market is not trading, leave with your holdings as they are. The vault is a contract only you can withdraw from. The keeper can rebalance, cut risk at once and raise it back one step per four hours, and nothing else.`],
          ].map(([q, a], i) => (
            <Reveal key={q} delay={i * 80} className={`acc-row ${open === i ? 'open' : ''}`}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                {q} <span className="plus">{open === i ? '−' : '+'}</span>
              </button>
              <p>{a}</p>
            </Reveal>
          ))}
        </div>

      </section>

      <Stage v={v} bars={bars} bLo={bLo} bHi={bHi} />

      {/* ------------------------------------------------------------ call to action */}
      <section className="cta">
        <Reveal className="cta-icon"><Shield /></Reveal>
        <Reveal as="h2" delay={80}>Open a vault</Reveal>
        <Reveal as="p" delay={160} className="muted">Any amount of USDT on BSC. Withdraw at today's value any time.</Reveal>
        <Reveal delay={240} className="cta-row">
          <a className="pill dark" href="#start">Start now <span className="arrow">→</span></a>
          <a className="pill light" href="/demo">See a live vault</a>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ deposit */}
      <section className="deposit" id="deposit">
        <Reveal as="h2">Use Binance Agentic Wallet? Let your agent open it.</Reveal>
        <Reveal as="p" delay={60} className="muted lead-p">Same vault, opened by your agent with two contract calls in developer mode. Preview first, then execute.</Reveal>
          <Reveal className="card steps" delay={100}>
            <ol>
              <li><b>Approve</b> USDT for the factory <code>{FACTORY}</code>, amount {amount}.</li>
              <li><b>Call</b> <code>open({stock?.id ?? '…'}, {bps}, {amount}e18)</code> on the factory. Your vault is created and the money goes to work in the same transaction.</li>
              <li><b>Watch it</b> at <code>/vault/&lt;your vault&gt;</code>: value, floor, break distance and every action with a BscScan link.</li>
            </ol>
            <p className="muted">Developer mode contract-call, preview first, then execute. Positions live in your vault, not in the wallet.</p>
          </Reveal>
      </section>

      {/* ------------------------------------------------------------ sources */}
      {calc && stock && (
        <section className="sources-band">
          <dl className="sources">
            <div><dt>Safe leg now</dt><dd>{market ? <>{market.name}, {pct(market.rate, 2)} a year, {pct(market.utilization)} lent out, {GATE_CODES[market.gateCode]}</> : 'no lending market passes the health gate: funds would wait in USDT'}</dd></div>
            {defi && defi.length > 0 && <div><dt>Binance DeFi API</dt><dd>
              USDT earn products on BSC by size: {defi.slice(0, 6).map((d, i) => <span key={d.protocolId + i}>{i ? ', ' : ''}<span className={d.allowed ? '' : 'muted'}>{d.protocol} {pct(d.apy, 2)}</span></span>)}.
              Plinth uses Venus and Aave only; the others carry risks a floor should not sit on (credit, synthetic dollars, lockups).
            </dd></div>}
            <div><dt>Floor assumes</dt><dd>{pct(calc.rate, 2)} a year (the safe leg's rate, capped at {pct(live!.maxFloorRate, 0)})</dd></div>
            <div><dt>Multiplier</dt><dd>{stock.cap} for {name}, the highest with no floor breaks over 10 years (read from the factory)</dd></div>
            <div><dt>10-year test</dt><dd>
              {bps === 10_000 && cal ? <>{cal.windows} windows from {cal.from}: lowest {usd(cal.min * scale, 2)}, typical {usd(cal.median * scale)}, best {usd(cal.max * scale)}, beat plain lending {pct(cal.beatSafeOnly, 0)} of the time. </> : 'Covers the 100% floor. '}
              {calibration.source}, {calibration.generated.slice(0, 10)}.
            </dd></div>
          </dl>
        </section>
      )}

      <Footer />
    </div>
  );
}

function Stage({ v, bars, bLo, bHi }: { v?: VaultLive['s']; bars: number[]; bLo: number; bHi: number }) {
  const [ref, p] = useScrollProgress<HTMLElement>();
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    fetch(`https://plinth-relay.vercel.app/api/vault-log?vault=${DEMO_VAULT}`)
      .then((r) => (r.ok ? r.json() : null))
      // Only what the agent or the vault did, not the saver's own deposits and withdrawals.
      .then((d) => {
        const keep = new Set(['MultiplierSet', 'Rebalanced', 'Traded', 'PulledOut', 'MovedSafeLeg', 'Impaired']);
        const row = d?.rows?.find((r: { event: string }) => keep.has(r.event));
        setLast(row ? row.detail.split(';')[0] : d ? 'no keeper action yet' : 'history unavailable');
      })
      .catch(() => setLast('history unavailable'));
  }, []);
  const n = (x: bigint) => Number(x) / 1e18;
  const rise = (1 - Math.min(1, p * 1.6)) * 140; // devices settle as the stage scrolls in
  const grow = Math.min(1, p * 2.2);
  const bd = v && v.breakDistance < 10n ** 30n ? n(v.breakDistance) : null;
  const gain = v ? n(v.total) - n(v.deposited) : 0;
  const Bars = ({ every = 1 }: { every?: number }) => (
    <div className="bars">
      {bars.filter((_, k) => k % every === 0).map((b, k) => <span key={k} style={{ height: `${((b - bLo) / (bHi - bLo)) * 100}%`, transform: `scaleY(${grow})` }} />)}
    </div>
  );
  return (
    <section className="stage" ref={ref}>
      <div className="stage-word" style={{ transform: `translateY(${(0.55 - p) * 60}%)` }} aria-hidden>plinth</div>
      <div className="laptop" style={{ transform: `translateY(${rise}px)` }}>
        <div className="laptop-screen">
          <div className="app-bar">
            <span className="brand-sm"><span className="logo-dot" /> plinth</span>
            <span className="tabs"><b>Overview</b><span>Actions</span><span>Proof</span></span>
            <span className="muted mono">{short(DEMO_VAULT)}</span>
          </div>
          <div className="laptop-grid">
            <div>
              <p className="device-label">Value now</p>
              <p className="device-big">{v ? <CountUp value={n(v.total)} format={(x) => usd(x, 2)} /> : '…'}</p>
              {v && (
                <div className="chips">
                  <span className="chip"><i className="c-red" /> floor {usd(n(v.floor), 2)}</span>
                  <span className="chip"><i className="c-yellow" /> {usd(n(v.stockUsd), 2)} in stock</span>
                  <span className="chip"><i className="c-green" /> {GATE_CODES[v.gateCode]}</span>
                </div>
              )}
            </div>
            <div className="tile-row">
              <div className="tile"><span>Break distance</span><b>{bd === null ? '–' : pct(bd)}</b></div>
              <div className="tile"><span>Multiplier</span><b>{v ? n(v.multiplier) : '–'}</b></div>
              <div className="tile dark"><span>Safe leg</span><b>{v ? pct(n(v.floorRate), 2) : '–'}</b></div>
            </div>
          </div>
          <p className="device-label">Replay · Nvidia, Nov 2018 · value above the floor at each step</p>
          <Bars />
        </div>
        <div className="laptop-base" />
      </div>

      <div className="phone" style={{ transform: `translateY(${rise * 1.7}px)` }}>
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-top"><span className="brand-sm"><span className="logo-dot" /> Nvidia vault</span><span className="live-pill"><i className="live-dot" /> live</span></div>
          <p className="device-label">Value now</p>
          <p className="phone-big">{v ? <CountUp value={n(v.total)} format={(x) => usd(x, 2)} /> : '…'}</p>
          {v && <p className={`delta ${gain >= 0 ? 'up' : 'down'}`}>{gain >= 0 ? '+' : '−'}{usd(Math.abs(gain), 2)} since you opened it</p>}
          <div className="phone-chart"><Bars every={2} /></div>
          <div className="phone-tiles">
            <div className="tile"><span>Floor</span><b>{v ? usd(n(v.floor), 2) : '–'}</b></div>
            <div className="tile yellow"><span>In Nvidia</span><b>{v ? usd(n(v.stockUsd), 2) : '–'}</b></div>
            <div className="tile red"><span>Break distance</span><b>{bd === null ? '–' : pct(bd)}</b></div>
            <div className="tile dark"><span>Multiplier</span><b>{v ? n(v.multiplier) : '–'}</b></div>
          </div>
          <div className="phone-row"><span className="muted">Keeper, last action</span><b>{last ?? 'reading…'}</b></div>
          <a className="pill dark" href="/demo">Open the live vault →</a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const [keeper, setKeeper] = useState<string | null>(null);
  useEffect(() => { currentKeeper().then(setKeeper).catch(() => setKeeper(null)); }, []);
  return (
    <footer className="foot">
      <div className="foot-in">
      <div className="foot-cols">
        <div>
          <p className="foot-h">Plinth</p>
          <p className="muted">Capital-protected savings on tokenized stocks. Not a guarantee: a floor we defend, with the risks named.</p>
        </div>
        <div>
          <p className="foot-h">On chain</p>
          <a href={`${BSCSCAN}/address/${FACTORY}`}>Factory {short(FACTORY)}</a>
          {keeper && <a href={`${BSCSCAN}/address/${keeper}`}>Keeper {short(keeper)}</a>}
          <a href={`${RELAY}/api/health`}>Binance Web3 API relay</a>
          <a href={`${BSCSCAN}/address/${DEMO_VAULT}`}>Live vault {short(DEMO_VAULT)}</a>
        </div>
        <div>
          <p className="foot-h">Look closer</p>
          <a href="/proof">Proof and replays</a>
          <a href="/demo">Live vault</a>
          <a href="https://github.com/jenzylove/plinth">Code</a>
        </div>
        <div>
          <p className="foot-h">Risks</p>
          <p className="muted small">A gap bigger than the break distance before anyone can trade. A lending pool failing faster than the health check. Smart contract bugs. Tokenized stocks are not the stocks themselves.</p>
        </div>
      </div>
      <p className="wordmark" aria-hidden>plinth</p>
      </div>
    </footer>
  );
}
