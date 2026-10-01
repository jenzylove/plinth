import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { Front } from './pages/Front';
import { VaultPage } from './pages/Vault';
import { Proof } from './pages/Proof';
import { DEMO_VAULT } from './chain';
import { connect, useAccount } from './account';
import { hasWallet } from './wallet';
import { short } from './format';

function WalletButton() {
  const { account, connecting } = useAccount();
  if (account) return <a className="pill light nav-cta" href="/#start"><i className="live-dot" /> {short(account)}</a>;
  return (
    <button className="pill light nav-cta" disabled={connecting} onClick={() => (hasWallet() ? connect() : document.getElementById('start')?.scrollIntoView({ behavior: 'smooth' }))}>
      {connecting ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}

function route() {
  const p = location.pathname.replace(/\/$/, '');
  const m = p.match(/^\/vault\/(0x[0-9a-fA-F]{40})$/);
  if (m) return <VaultPage address={m[1] as `0x${string}`} />;
  if (p === '/demo') return <VaultPage address={DEMO_VAULT} demo />;
  if (p === '/proof') return <Proof />;
  return <Front />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <header className="top">
      <a href="/" className="brand"><span className="logo-dot" /> plinth</a>
      <nav className="navpill">
        <a href="/#how">How it works</a>
        <a href="/demo">Live vault</a>
        <a href="/proof">Proof</a>
      </nav>
      <WalletButton />
    </header>
    <main>{route()}</main>
  </StrictMode>,
);
