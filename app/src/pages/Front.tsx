import { useEffect, useMemo, useState } from 'react';
import { floorValue, startingExposure, YEAR_SECONDS } from '@core/cppi';
import {
  BSCSCAN, DEMO_VAULT, FACTORY, GATE_CODES, RELAY, bestMarket, currentKeeper, factoryTerms, listedStocks, rwaPrice, safeMarkets,
  routeName, routeRoundTrip, usdtEarnProducts, vaultStatus, type DefiProduct, type ListedStock, type SafeMarket,
} from '../chain';
import type { Address } from 'viem';
import { calibration, calibrationOf, gapOf, NAMES, outcomes, replays, symOf, type OutcomeYear } from '../data';
import { pct, short, usd, wad } from '../format';
import { CountUp, FillText, Reveal, useScrollProgress } from '../motion';
import { Deposit } from '../Deposit';
import { humanize } from '../humanize';

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
          Pick a stock and how much you want back in a year. Part of your money rides the stock, the rest earns
          interest, and an agent moves it toward safety, day and night, when the stock falls. Leave any time.
        </p>
        <div className="welcome">
          <span><i>1</i> Pick a stock and how much you want back</span>
          <span><i>2</i> Connect your wallet</span>
          <span><i>3</i> Deposit. Watch it live, withdraw any time</span>
        </div>

        <div className="calc card" id="start">
          <p className="sentence">
            <span className="phrase">Put{' '}
            <span className="field money">$<input aria-label="Amount in USDT" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) * 100) / 100 || 0))} /></span></span>{' '}
            <span className="phrase">into{' '}
            <span className="field">
              <select aria-label="Stock" value={sym} onChange={(e) => setSym(e.target.value)}>
                {(live?.stocks ?? [{ sym: 'NVDA' }]).map((s) => <option key={s.sym} value={s.sym}>{NAMES[s.sym] ?? s.sym}</option>)}
              </select>
            </span></span>{' '}
            <span className="phrase">and get <span className="field">{bps / 100}%</span> back</span>
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
              <div className="stat"><span>Rides {name}</span><strong><CountUp value={calc.inStock} format={(x) => usd(x)} /></strong></div>
              <div className="stat"><span>Floor at {calc.months} months</span><strong><CountUp value={calc.promise} format={(x) => usd(x)} /></strong>
                <small className="muted">what the vault defends for you</small></div>
              <div className="stat"><span>Leave right after</span><strong>{roundTrip ? <CountUp value={amount - roundTrip.cost} format={(x) => usd(x, 2)} /> : '…'}</strong>
                <small className="muted">{roundTrip ? 'if you changed your mind now, a live quote' : 'getting a live quote'}</small></div>
            </div>
          )}
          {calc && <Outcomes sym={sym} name={name} bps={bps} amount={amount} />}
          {calc && (
            <p className="muted small conditions">
              Defended by code, not guaranteed. The floor can break if {name} drops {calc.inStock > 0 ? pct((amount - calc.floor) / calc.inStock) : 'a lot'} or
              more before anyone can trade, if the lending market fails, or if USDT loses its peg.
            </p>
          )}
          {calc && <Deposit stockId={stock?.id} bps={bps} amount={amount} name={name} onAmount={setAmount} />}
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section className="how" id="how">
        <div className="split">
          <Reveal as="h2">Your money in two parts, and an agent watching both.</Reveal>
          <Reveal as="p" delay={120} className="muted">
            Banks have sold protected savings like this for decades. Tokenized stocks trade at 3am on a Sunday, so
            Plinth can move to safety when a bank cannot.
          </Reveal>
        </div>
        <div className="cards">
          <Reveal className="card step">
            <span className="tag yellow">1 · The safe part</span>
            <h3>Most of it earns interest.</h3>
            <p className="muted">
              Lent on {market?.name ?? 'Venus or Aave'}{market && <> at <b>{pct(market.rate, 2)}</b> a year</>}. If the market
              looks unhealthy, the vault pulls out first.
            </p>
            {calc && <div className="big"><CountUp value={amount - calc.inStock} format={(x) => usd(x)} /><small>of {usd(amount)}</small></div>}
          </Reveal>
          <Reveal className="card step" delay={120}>
            <span className="tag red">2 · The stock part</span>
            <h3>The rest rides {name}.</h3>
            <p className="muted">
              Sized so {name} could drop {calc && calc.inStock > 0 ? <b>{pct((amount - calc.floor) / calc.inStock)}</b> : '–'} in one go
              and your floor still holds.
            </p>
            {calc && <div className="big"><CountUp value={calc.inStock} format={(x) => usd(x)} /><small>in {name}</small></div>}
          </Reveal>
          <Reveal className="card step black" delay={240}>
            <span className="tag">3 · The agent</span>
            <h3>Watches every minute, and cuts risk before big news.</h3>
            <p>
              When the stock falls it sells toward safety. It can never withdraw your money.
            </p>
            <div className="big">24/7<small>nights and weekends too</small></div>
            <AgentLive />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ the big number */}
      <section className="proofband">
        <Reveal className="huge-wrap">
          <p className="huge-kicker">Nvidia, 16 Nov 2018: opened {pct(Math.abs(gap?.worstGap ?? 0.193))} down</p>
          <div className="huge"><CountUp value={plinthAtGap} format={(x) => usd(x, 2)} /></div>
          <p className="huge-sub">still above the floor, on $1,000</p>
        </Reveal>
        <Reveal className="huge-note" delay={150}>
          <p>
            We replayed that morning through Plinth's real contracts. A bank desk running the same method had
            only <b>{usd(bankAtGap, 2)}</b> left above its floor. The difference: Plinth's agent cut risk before the earnings report.
          </p>
          <p className="muted"><a href="/proof">See the replay</a></p>
        </Reveal>
      </section>


      {/* ------------------------------------------------------------ explainer */}
      <section className="explain">
        <div className="acc">
          <Reveal as="h2">Questions.</Reveal>
          {[
            ['Is my money guaranteed?', `No. The floor is defended by code, not guaranteed. ${stock && calc ? `Today, of ${usd(amount)} in ${name}, about ${usd(calc.inStock)} rides the stock and the rest earns interest. ` : ''}When the stock falls, the agent sells toward safety, so the floor only breaks if ${name} falls further than the vault can react to in one go, if the lending market fails, or if USDT loses its peg. There is no insurer behind it.`],
            ['Why does trading at night matter?', `Banks can only sell while New York is open. Tokenized stocks keep trading at night and on weekends, and some big falls happen then: SanDisk once fell 20% before the next open. Plinth can sell during those hours. It also ignores short glitches in the price, so a bad tick never makes it sell at the bottom.`],
            ['Where does the safe money go?', `Only to Venus and Aave, the two largest USDT lending markets on BNB Chain. Before every move the vault checks they are healthy. If neither is, the money waits as cash in your vault.`],
            ['Can I leave any time?', `Yes. Withdraw any time at today's value. Only you can withdraw from your vault. The agent can rebalance and lower risk, but it can never take money out.`],
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

      {/* ------------------------------------------------------------ agentic wallet */}
      <section className="deposit" id="agent">
        <Reveal as="h2">Prefer to just ask? Use your Binance Agentic Wallet.</Reveal>
        <Reveal as="p" delay={60} className="muted lead-p">
          If you use an AI assistant such as Claude Code, Cursor or Codex, you can open and manage a vault in plain words.
          Your wallet shows exactly what will happen before anything runs, and nothing moves until you say yes.
        </Reveal>
        <Reveal className="onboard" delay={100}>
          <div className="ob-step">
            <i>1</i>
            <div>
              <b>Set up your Agentic Wallet</b>
              <p className="muted">Create one in the Binance app, then add it to your assistant:</p>
              <Copy text="npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet" />
            </div>
          </div>
          <div className="ob-step">
            <i>2</i>
            <div>
              <b>Turn on Developer Mode</b>
              <p className="muted">In the Binance app, open your Agentic Wallet's settings. This lets it call Plinth's contract, still one previewed step at a time.</p>
            </div>
          </div>
          <div className="ob-step">
            <i>3</i>
            <div>
              <b>Add the Plinth skill</b>
              <p className="muted">It teaches your assistant how Plinth works:</p>
              <Copy text="npx skills add jenzylove/plinth" />
            </div>
          </div>
          <div className="ob-step">
            <i>4</i>
            <div>
              <b>Ask</b>
              <div className="asks">
                <span>"Protect $50 in Nvidia at 95%"</span>
                <span>"How is my Plinth vault doing?"</span>
                <span>"Withdraw 10% of my vault"</span>
              </div>
              <p className="muted">For each step your wallet shows the USDT that leaves or comes back and any risks it finds. You confirm, it runs.</p>
            </div>
          </div>
        </Reveal>
        <Reveal as="p" delay={160} className="muted small chat-foot">
          Already tested on mainnet: <a href={`${BSCSCAN}/tx/0x5e00e4cc95dc12c7fef888a0bc93873493f5ec326cf7f91df1552baae4948f81`}>a withdrawal run through the skill</a>.
        </Reveal>
      </section>

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
        const plain = d?.rows ? humanize(d.rows, 'Nvidia').filter((x) => x.tone !== 'you') : [];
        setLast(plain.length ? plain[0].text : d ? 'nothing yet' : 'history unavailable');
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
            <span className="tabs"><b>Overview</b><span>Activity</span><span>Proof</span></span>
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
              <div className="tile"><span>Drop it can take</span><b>{bd === null ? '–' : pct(bd)}</b></div>
              <div className="tile"><span>Risk level</span><b>{v ? n(v.multiplier) : '–'}</b></div>
              <div className="tile dark"><span>Interest</span><b>{v ? pct(n(v.floorRate), 2) : '–'}</b></div>
            </div>
          </div>
          <p className="device-label">Replay of Nvidia, November 2018: value above the floor, day by day</p>
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
          <div className="phone-tiles">
            <div className="tile"><span>Floor</span><b>{v ? usd(n(v.floor), 2) : '–'}</b></div>
            <div className="tile yellow"><span>In Nvidia</span><b>{v ? usd(n(v.stockUsd), 2) : '–'}</b></div>
            <div className="tile red"><span>Drop it can take</span><b>{bd === null ? '–' : pct(bd)}</b></div>
            <div className="tile dark"><span>Risk level</span><b>{v ? n(v.multiplier) : '–'}</b></div>
          </div>
          <div className="phone-row"><span className="muted">The agent's last move</span><b>{last ?? 'reading…'}</b></div>
          <a className="pill dark" href="/demo">Open the live vault →</a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const repo = 'https://github.com/jenzylove/plinth';
  return (
    <footer className="foot">
      <div className="foot-in">
      <div className="foot-cols">
        <div>
          <p className="foot-h">Plinth</p>
          <p className="muted">Savings on tokenized US stocks, with a floor defended by code, not guaranteed. Built on BNB Chain.</p>
        </div>
        <div>
          <p className="foot-h">Product</p>
          <a href="/#how">How it works</a>
          <a href="/demo">Live vault</a>
          <a href="/proof">Proof</a>
        </div>
        <div>
          <p className="foot-h">Build</p>
          <a href={repo}>Code on GitHub</a>
          <a href={`${repo}/blob/main/docs/DEPLOYMENTS.md`}>Contracts</a>
          <a href={`${repo}/blob/main/skills/plinth/SKILL.md`}>Agentic Wallet skill</a>
        </div>
      </div>
      <p className="wordmark" aria-hidden>plinth</p>
      </div>
    </footer>
  );
}

/** A command with a copy button. */
function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy">
      <code>{text}</code>
      <button onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>{done ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

/** Whether the agent is running right now, from its own live status. Shows nothing rather than a guess. */
function AgentLive() {
  const [st, setSt] = useState<{ ago: number; checks: number } | null>(null);
  useEffect(() => {
    const load = () => fetch(`${RELAY}/agent/keeper`).then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.lastPassAt && setSt({ ago: Math.max(0, (Date.now() - Date.parse(j.lastPassAt)) / 1000), checks: j.passes }))
      .catch(() => setSt(null));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!st) return null;
  const fresh = st.ago < 300;
  const ago = st.ago < 90 ? `${Math.round(st.ago)} seconds ago` : `${Math.round(st.ago / 60)} minutes ago`;
  return <p className={`agent-live ${fresh ? 'on' : 'off'}`}><i />{fresh ? 'Online now' : 'Not checked recently'}: last check {ago}</p>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** The stock's real worst, typical and best 12 months, replayed through the vault's rules, next to holding it. */
function Outcomes({ sym, name, bps, amount }: { sym: string; name: string; bps: number; amount: number }) {
  const o = outcomes.stocks[sym];
  if (!o) return <p className="muted small outcomes-none">{name} has under a year of history, so there is no past year to replay yet.</p>;
  const k = String(bps / 100);
  const scale = amount / 1000;
  const rows: [string, OutcomeYear][] = [[`${name}'s worst year`, o.worst], ['A typical year', o.typical], [`${name}'s best year`, o.best]];
  const top = Math.max(...rows.map(([, y]) => Math.max(y.hold, y.plinth[k])));
  const w = (v: number) => `${Math.max(2, (v / top) * 100)}%`;
  return (
    <div className="outcomes">
      <div className="outcomes-head">
        <h3>What {usd(amount)} became in {name}'s real years</h3>
        <span className="legend"><i className="lg-hold" />Holding {name}<i className="lg-plinth" />Plinth at {bps / 100}%</span>
      </div>
      {rows.map(([label, y]) => {
        const change = y.hold / 1000 - 1;
        return (
          <div className="outcome" key={label}>
            <div className="o-label"><b>{label}</b><span>{monthYear(y.from)} to {monthYear(y.to)}: {name} {change >= 0 ? '+' : ''}{Math.round(change * 100)}%</span></div>
            <div className="o-bars">
              <div className="o-bar hold" style={{ width: w(y.hold) }}><span>{usd(y.hold * scale)}</span></div>
              <div className="o-bar plinth" style={{ width: w(y.plinth[k]) }}><span>{usd(y.plinth[k] * scale)}</span></div>
            </div>
          </div>
        );
      })}
      <p className="muted small">
        Real daily prices from the last ten years, run through the vault's rules with trading costs: {o.windows} past
        12 month stretches, these are three of them. The past is not a forecast, and the rules were tuned on this same
        history. <a href="/proof">Every stock</a>.
      </p>
    </div>
  );
}
