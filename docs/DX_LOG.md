# Developer experience log (raw facts for the user's report)

Facts only, with dates. The user writes the Developer Experience Report from these.

## 2026-09-30 Agentic Wallet onboarding
- Skill install: `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet` worked first time. `baw` CLI came from `npm i -g @binance/agentic-wallet` (v1.10.0).
- The docs page (install-agentic-wallet) says to open settings via "Settings icon (top right)" but that icon only exists inside the Binance mobile app after the first sign-in. The user looked for it on the docs site.
- Sign-in links expire after 5 minutes. Two links expired while the user was still setting up.
- In the app: an "app not updated" error while the Play Store app was already current.
- Scanning the code on desktop returned "create an Agentic Wallet first" only after the scan, not before.
- Wallet creation stuck at "Generating secure keys... 39%" on 4G mobile data.
- Sign-in asked for authenticator code plus email code; the pairing code is a separate visual match. Easy to confuse.
- Third link: signed in successfully.
- Defaults after creation: dailyLimit 50,000 USD, Developer Mode off, abnormalTxnHandling AutoReject, tradeAllTokens false, sessions 48h (signInMaxTime 7 days). A $50,000 default daily limit is high for a new AI-operated wallet.
- Same EVM address on BSC, Ethereum, Base, Arbitrum, Polygon, Robinhood Chain.
