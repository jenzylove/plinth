import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { Front } from './pages/Front';
import { VaultPage } from './pages/Vault';
import { Proof } from './pages/Proof';
import { DEMO_VAULT } from './chain';

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
      <a href="/" className="brand">Plinth</a>
      <nav>
        <a href="/demo">Live vault</a>
        <a href="/proof">Proof</a>
      </nav>
    </header>
    <main>{route()}</main>
  </StrictMode>,
);
