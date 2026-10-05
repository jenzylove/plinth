import { useEffect, useState } from 'react';
import type { Address, Hash } from 'viem';
import { BSCSCAN, client, openLimits, walletHoldings } from './chain';
import { NAMES, stocks as listedStocks } from './data';
import { short, usd } from './format';
import { approve, hasWallet, openVault, usdtState, usdtUnits, vaultsOf } from './wallet';
import { connect, useAccount } from './account';

type Step = 'idle' | 'connecting' | 'ready' | 'approving' | 'depositing' | 'done';

const errText = (e: unknown) => {
  const m = String((e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? e);
  if (/rejected|denied/i.test(m)) return 'You cancelled it in your wallet. Nothing was sent.';
  return m.split('\n')[0];
};

/** Connect → approve USDT → open the vault. Every step is a real BSC mainnet transaction from the saver's wallet. */
export function Deposit({ stockId, bps, amount, name, onAmount }: { stockId?: number; bps: number; amount: number; name: string; onAmount: (x: number) => void }) {
  const { account, error: connectError, connecting } = useAccount();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hash; vault: Address } | null>(null);
  const [mine, setMine] = useState<Address[]>([]);
  const [bnb, setBnb] = useState<bigint | null>(null);
  const [holdings, setHoldings] = useState<Awaited<ReturnType<typeof walletHoldings>> | null>(null);

  // What is signed is exactly what is shown: the amount in whole cents.
  const want = amount > 0 ? usdtUnits(amount) : 0n;
  const signed = Number(want) / 1e18;
  const amt = usd(signed, 2);
  const refresh = async (a: Address) => {
    const s = await usdtState(a);
    setBalance(s.balance); setAllowance(s.allowance);
    setBnb(await client.getBalance({ address: a }).catch(() => null));
    walletHoldings(a, listedStocks).then(setHoldings).catch(() => setHoldings(null));
    setMine(await vaultsOf(a));
  };
  // A new account starts from a clean slate: no balance, allowance or vault list from the previous one.
  useEffect(() => {
    setBalance(null); setAllowance(0n); setMine([]); setBnb(null); setHoldings(null); setDone(null); setError(null);
    if (account) { refresh(account).catch(() => {}); setStep('ready'); }
  }, [account]);
  // The factory's limits for this stock: the smallest first deposit and the most one vault may hold.
  const [limits, setLimits] = useState<{ minOpen: number; maxVault: number | null } | null>(null);
  useEffect(() => { if (stockId !== undefined) openLimits(stockId).then(setLimits).catch(() => setLimits(null)); }, [stockId]);
  const tooSmall = !!limits && amount < limits.minOpen;
  const tooBig = !!limits?.maxVault && amount > limits.maxVault;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errText(e)); setStep(account ? 'ready' : 'idle'); }
  };

  const onConnect = () => run(async () => { await connect(); });
  const onApprove = () => run(async () => {
    setStep('approving');
    await approve(account!, want);
    await refresh(account!); setStep('ready');
  });
  const onDeposit = () => run(async () => {
    setStep('depositing');
    const r = await openVault(account!, stockId!, bps, want);
    setDone(r); await refresh(account!); setStep('done');
  });

  const hasFunds = balance !== null && balance >= want;
  const enough = hasFunds && !tooSmall && !tooBig;
  const approved = allowance >= want;
  const busy = connecting || step === 'approving' || step === 'depositing';

  return (
    <div className="flow">
      <ol className="flow-steps">
        <li className={account ? 'ok' : 'now'}>
          <span>1</span>
          <div>
            <b>Connect your wallet</b>
            {account ? <p className="muted">{short(account)} on BSC · {balance === null ? 'reading…' : `${usd(Number(balance) / 1e18, 2)} USDT`}</p>
              : <p className="muted">{hasWallet() ? 'Binance Web3 Wallet, MetaMask or Trust. We switch it to BSC.' : 'No wallet in this browser. Open this page in Binance Web3 Wallet or install MetaMask.'}</p>}
          </div>
          {!account && (hasWallet()
        ? <button className="pill dark" disabled={busy} onClick={onConnect}>{connecting ? 'Connecting…' : 'Connect'}</button>
        : <a className="pill dark" href={`https://metamask.app.link/dapp/${typeof location !== 'undefined' ? location.host : 'plinth-savings.vercel.app'}`}>Open in a wallet app</a>)}
        </li>
        <li className={!account ? '' : approved ? 'ok' : 'now'}>
          <span>2</span>
          <div>
            <b>Allow {amt} USDT</b>
            <p className="muted">One approval so the factory can move exactly this amount into your new vault.</p>
          </div>
          {account && !approved && <button className="pill dark" disabled={busy || !enough || amount <= 0} onClick={onApprove}>{step === 'approving' ? 'Approving…' : 'Approve'}</button>}
        </li>
        <li className={step === 'done' ? 'ok' : account && approved ? 'now' : ''}>
          <span>3</span>
          <div>
            <b>Deposit and start</b>
            <p className="muted">Creates your vault and puts {name} and the safe part to work in the same transaction.</p>
          </div>
          {account && approved && step !== 'done' && (
            <button className="pill red" disabled={busy || !enough || amount <= 0 || stockId === undefined} onClick={onDeposit}>{step === 'depositing' ? 'Depositing…' : `Deposit ${amt}`}</button>
          )}
        </li>
      </ol>
      {account && holdings && (
        <p className="muted small">
          In this wallet (Binance Wallet API): {usd(holdings.usdt, 2)} USDT
          {holdings.stocks.length > 0 && <>, and {holdings.stocks.map((h) => `${NAMES[h.sym] ?? h.sym} ${usd(h.usd, 2)}`).join(', ')} in bStocks held outright, with no floor under them</>}.
        </p>
      )}
      {account && bnb !== null && bnb < 300_000_000_000_000n && <p className="fail">This wallet has {(Number(bnb) / 1e18).toFixed(5)} BNB. Approving and depositing need a little BNB for gas (about 0.0003 BNB, a few cents). Send some BNB (BNB Smart Chain) to {short(account)} first.</p>}
      {tooSmall && <p className="fail">The smallest first deposit is {usd(limits!.minOpen, 2)}.</p>}
      {tooBig && <p className="fail">One vault holds at most {usd(limits!.maxVault!)} for this stock, so a full move to safety takes a few trades of at most $10k each. <button className="linkish" onClick={() => onAmount(limits!.maxVault!)}>Use {usd(limits!.maxVault!)}</button></p>}
      {account && balance === 0n && <p className="fail">This wallet has no USDT on BSC yet. Send any amount of USDT (BEP-20, BNB Smart Chain) to {short(account)}, then come back. </p>}
      {account && balance !== null && balance > 0n && !hasFunds && <p className="fail">This wallet has {usd(Number(balance) / 1e18, 2)} USDT on BSC. <button className="linkish" onClick={() => onAmount(Math.floor((Number(balance) / 1e18) * 100) / 100)}>Deposit all of it</button> or lower the amount.</p>}
      {connectError && <p className="fail">{connectError}</p>}
      {error && <p className="fail">{error}</p>}
      {done && (
        <p className="success">
          Your vault is open: <a href={`/vault/${done.vault}`}>{short(done.vault)}</a> · <a href={`${BSCSCAN}/tx/${done.hash}`}>transaction</a>
        </p>
      )}
      {mine.length > 0 && (
        <div className="mine">
          <b>Your vaults</b>
          {mine.map((v) => <a key={v} className="chip" href={`/vault/${v}`}>{short(v)} →</a>)}
        </div>
      )}
    </div>
  );
}
