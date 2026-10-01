import { useEffect, useState } from 'react';
import type { Address, Hash } from 'viem';
import { BSCSCAN } from './chain';
import { short, usd } from './format';
import { approve, connect, hasWallet, openVault, usdtState, usdtUnits, vaultsOf } from './wallet';

type Step = 'idle' | 'connecting' | 'ready' | 'approving' | 'depositing' | 'done';

const errText = (e: unknown) => {
  const m = String((e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? e);
  if (/rejected|denied/i.test(m)) return 'You cancelled it in your wallet. Nothing was sent.';
  return m.split('\n')[0];
};

/** Connect → approve USDT → open the vault. Every step is a real BSC mainnet transaction from the saver's wallet. */
export function Deposit({ stockId, bps, amount, name }: { stockId?: number; bps: number; amount: number; name: string }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hash; vault: Address } | null>(null);
  const [mine, setMine] = useState<Address[]>([]);

  const want = amount > 0 ? usdtUnits(amount) : 0n;
  const refresh = async (a: Address) => {
    const s = await usdtState(a);
    setBalance(s.balance); setAllowance(s.allowance);
    setMine(await vaultsOf(a));
  };
  useEffect(() => { if (account) refresh(account).catch(() => {}); }, [account]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errText(e)); setStep(account ? 'ready' : 'idle'); }
  };

  const onConnect = () => run(async () => {
    setStep('connecting');
    const a = await connect();
    setAccount(a); setStep('ready');
  });
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

  const enough = balance !== null && balance >= want;
  const approved = allowance >= want;
  const busy = step === 'connecting' || step === 'approving' || step === 'depositing';

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
          {!account && <button className="pill dark" disabled={busy || !hasWallet()} onClick={onConnect}>{step === 'connecting' ? 'Connecting…' : 'Connect'}</button>}
        </li>
        <li className={!account ? '' : approved ? 'ok' : 'now'}>
          <span>2</span>
          <div>
            <b>Allow {usd(amount)} USDT</b>
            <p className="muted">One approval so the factory can move exactly this amount into your new vault.</p>
          </div>
          {account && !approved && <button className="pill dark" disabled={busy || !enough} onClick={onApprove}>{step === 'approving' ? 'Approving…' : 'Approve'}</button>}
        </li>
        <li className={step === 'done' ? 'ok' : account && approved ? 'now' : ''}>
          <span>3</span>
          <div>
            <b>Deposit and start</b>
            <p className="muted">Creates your vault and puts {name} and the safe part to work in the same transaction.</p>
          </div>
          {account && approved && step !== 'done' && (
            <button className="pill red" disabled={busy || !enough || stockId === undefined} onClick={onDeposit}>{step === 'depositing' ? 'Depositing…' : `Deposit ${usd(amount)}`}</button>
          )}
        </li>
      </ol>
      {account && balance !== null && !enough && <p className="fail">This wallet has {usd(Number(balance) / 1e18, 2)} USDT on BSC, less than {usd(amount)}. Lower the amount or add USDT (BEP-20).</p>}
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
