# sol.new features at a glance

**sol.new** is a zero-friction Solana product suite: passkey wallets, create flows, payments, gifts, exploration tools, and fair draws. No seed phrases. Instant and low fees.

**PDF:** [docs/sol-new-features-at-a-glance.pdf](./docs/sol-new-features-at-a-glance.pdf)  
**Site:** [https://sol.new](https://sol.new) · [features](https://sol.new/features) · [dir](https://sol.new/dir) · [docs](https://sol.new/docs)

---

## Core idea

| Pillar | What you get |
|--------|----------------|
| **Passkey wallet** | Face ID / fingerprint. No install, no seed phrase. |
| **Create** | Tokens, NFTs, multisigs, .sol names |
| **Move money** | Pay, split, gift, onramp, portfolio |
| **Explore** | Scan, receipt, lists, launches, news |
| **Play** | Fair draws, Punt picks |

---

## Wallet and identity

| Feature | Path | One-liner |
|---------|------|-----------|
| Passkey wallet | `/wallet` | Create or recover a Solana wallet secured by the device. |
| Get SOL | `/get`, `/wallet/get` | Onramp / fund flow (and devnet faucet context). |
| Send | `/wallet/send` | Transfer SOL / assets from the passkey wallet. |
| Portfolio | `/portfolio` | Balances and holdings overview. |
| .sol name | `/id` | Check and register a Bonfida-style name. |
| Sign message | `/message` | Prove ownership with a signed message. |
| Magic link | `/magic` | Email-linked open / recover path for passkey wallets. |

---

## Create on Solana

| Feature | Path | One-liner |
|---------|------|-----------|
| Token launch | `/token` | Deploy an SPL token (Meteora DBC bonding curve on mainnet). |
| Token page | `/token/[mint]` | Public token landing for a launched mint. |
| NFT mint | `/nft` | Image to NFT (standard Metaplex or compressed). |
| Multisig | `/multisig` | Squads-style shared wallet; view at `/multisig/[address]`. |
| Genesis | `/genesis/[mint]` | Genesis / Metaplex-related mint flows. |
| Live launches | `/launch` | Feed of recent launches; detail at `/launch/[mint]`. |

---

## Money and social payments

| Feature | Path | One-liner |
|---------|------|-----------|
| Pay | `/pay` | Solana Pay link or QR (SOL / USDC). |
| Split | `/split` | Split a bill, tip, share who paid. |
| Gift (send) | `/gift` | Fund a claimable link with SOL or USDC. |
| Gift (claim) | `/claim#…` | Open the secret fragment link and claim with Face ID. |
| Receipt | `/receipt`, `/receipt/[signature]` | Pretty, shareable Solana transaction receipt. |

**Gift note:** The claim secret lives in the URL fragment (`#…`). Anyone with the full link can claim. Share only in private channels.

---

## Yield and staking

| Feature | Path | One-liner |
|---------|------|-----------|
| Earn | `/earn` | Protected USDC yield. Passkey deposit / withdraw. |
| Stake SOL | `/stake` | Native validator staking (create, deactivate, withdraw). |
| Liquid stake | `/lst` | LSTs (jitoSOL, mSOL, INF, more). |

---

## Fair Draw

| Feature | Path | One-liner |
|---------|------|-----------|
| Fair Draw hub | `/draw` | Wheel, 1–N, coin, dice; duration + sound; history. |
| Wheel shortcut | `/wheel` | Opens draw in wheel mode. |
| Coin flip | `/flip` | Opens draw in coin mode. |
| Dice | `/dice` | Opens draw in dice mode. |
| Draw receipt | `/draw/[id]` | Shareable result (seed, hashes, slot). |
| Legacy alias | `/vrf` | Redirects to `/draw`. |

**Fair Draw rules of thumb**
- One free draw per mode per device, then passkey connect.
- History on-device always; server history when wallet is connected.
- Entropy: MagicBlock Solana VRF when `programs/fair-draw` is deployed and env is set; otherwise Solana blockhash (public, re-verifiable). ProofNetwork optional.

---

## Explore and research

| Feature | Path | One-liner |
|---------|------|-----------|
| Scan | `/scan` | Wallet, token, or program lookup. |
| Track | `/track` | Alias into scan / wallet tracking. |
| Lists | `/lists` | Watchlists and quotes. |
| Gallery | `/gallery` | Token gallery. |
| Compare | `/compare` | Side-by-side token compare. |
| Creator | `/creator/[wallet]` | Creator profile; edit at `/creator/edit`. |
| News | `/news` | Crypto headlines. |
| Pods | `/pods` | Crypto podcasts player. |
| Punt | `/punt` | Odds / picks (free-to-play style). |
| What's new | `/whats-new` | Recent launches feed. |

---

## Site and meta

| Feature | Path | One-liner |
|---------|------|-----------|
| Home | `/` | Product grid and onboarding. |
| Home (alt) | `/home` | Alternate home / product tour. |
| Directory | `/dir` | Everything on one page + external Solana links. |
| Features | `/features` | This overview as a page. |
| Docs | `/docs` | Costs, storage, what we store. |
| Admin | `/admin` | Internal tools. |
| Privacy / Terms | `/privacy`, `/terms` | Legal. |
| Browser | `/browser` | In-app / PWA browser helper surface. |

---

## API surfaces (selected)

| Endpoint | Use |
|----------|-----|
| `GET /api/costs` | Live action costs (used by docs). |
| `GET /api/stats` | Aggregate counts. |
| `POST /api/draw` | Create a fair draw. |
| `GET /api/draw?wallet=` | User draw history. |
| `GET /api/draw/[id]` | Single draw receipt data. |
| `GET /api/receipt?signature=` | Parsed transaction for receipts. |
| `GET/POST /api/gift` | Gift registry / claim status. |

Full product APIs also cover token, NFT, multisig, lists, launch, scan, subscribe, etc.

---

## Networks

- **Mainnet** — real SOL; fees per `/docs`.
- **Devnet** — test mode (toggle in nav); faucet via Get / wallet flows.

---

## Principles

1. **Passkey first** — create without seed phrases.
2. **Shareable links** — gifts, pays, receipts, draws.
3. **Low friction** — short paths, mobile-friendly, PWA-ready.
4. **Honest product** — private gift links are bearer secrets; fair draws document entropy.

---

## Quick map

```
sol.new
├── create     token · nft · multisig · id
├── wallet     wallet · get · send · portfolio
├── money      pay · split · gift · claim · receipt
├── draw       draw · wheel · flip · dice
├── explore    scan · lists · launch · gallery · compare · news · pods
└── meta       dir · features · docs · whats-new
```

*Last updated for the product surface as of the Fair Draw and gift OG work. Prefer `/dir` and `/features` on the live site when paths drift.*
