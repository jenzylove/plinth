// One wallet connection shared by the nav button, the deposit steps and the vault page.
import { useSyncExternalStore } from 'react';
import type { Address } from 'viem';
import { connect as connectWallet } from './wallet';

let account: Address | null = null;
let error: string | null = null;
let connecting = false;
const subs = new Set<() => void>();
let snapshot: { account: Address | null; error: string | null; connecting: boolean } = { account, error, connecting };

const emit = () => { snapshot = { account, error, connecting }; subs.forEach((f) => f()); };

export async function connect() {
  connecting = true; error = null; emit();
  try {
    account = await connectWallet();
  } catch (e) {
    const m = String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e);
    error = /rejected|denied/i.test(m) ? 'Connection cancelled in your wallet.' : m.split('\n')[0];
  }
  connecting = false; emit();
  return account;
}

if (typeof window !== 'undefined') {
  window.ethereum?.on?.('accountsChanged', (a) => { account = ((a as string[])[0] as Address) ?? null; emit(); });
}

export function useAccount() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => snapshot);
}
