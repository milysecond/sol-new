# sol.new features at a glance

**sol.new** is a zero-friction Solana product suite: passkey wallets, create flows, payments, gifts, short links, lend/borrow, exploration tools, and fair draws. No seed phrases. Instant and low fees.

**Site:** [https://sol.new](https://sol.new) · [features](https://sol.new/features) · [dir](https://sol.new/dir) · [docs](https://sol.new/docs)  
**LLMs:** [llms.txt](https://sol.new/llms.txt) · [llms-full.txt](https://sol.new/llms-full.txt)  
**Repo:** [README.md](./README.md)

---

## Core idea

| Pillar | What you get |
|--------|----------------|
| **Passkey wallet** | Face ID / fingerprint. No install, no seed phrase. |
| **Create** | Tokens, NFTs, multisigs, .sol names |
| **Move money** | Pay, split, gift, short links, onramp, portfolio |
| **Yield** | Earn USDC, lend/borrow, stake, LSTs |
| **Explore** | Scan, receipt, lists, launches, usernames |
| **Play** | Fair draws, Punt picks |

---

## Wallet and identity

| Feature | Path | One-liner |
|---------|------|-----------|
| Passkey wallet | `/wallet` | Create or recover a Solana wallet secured by the device. |
| Get SOL | `/get`, `/wallet/get` | Onramp / fund (and devnet faucet context). |
| Send | `/wallet/send` | Transfer SOL / USDC from the passkey wallet. |
| Portfolio | `/portfolio` | Balances and holdings overview. |
| Burn / reclaim | `/burn` | Close empty token accounts, reclaim rent. |
| .sol name | `/id` | Check and register a Solana name. |
| Username | `/creator/edit`, `/u/[name]` | Unique `@username` per wallet. |
| Sign message | `/message` | Prove ownership. |
| Magic link | `/magic` | Email-linked open for passkey wallets. |

---

## Create on Solana

| Feature | Path | One-liner |
|---------|------|-----------|
| Token launch | `/token` | SPL token + Meteora DBC bonding curve. |
| Token page | `/token/[mint]` | Public landing for a launched mint. |
| NFT mint | `/nft` | Image → standard or compressed NFT. |
| Multisig | `/multisig` | Shared wallet; `/multisig/[address]`. |
| Live launches | `/launch` | Feed + `/launch/[mint]`. |

---

## Money and social payments

| Feature | Path | One-liner |
|---------|------|-----------|
| Pay | `/pay` | Solana Pay link or QR (SOL / USDC). |
| Split | `/split` | Split a bill, tip, track who paid. |
| Gift (send) | `/gift` | Fund a claimable link (SOL or USDC). |
| Gift (claim) | `/claim#…` | Secret fragment + Face ID claim. |
| Short links | `/link`, `/link/[code]` | `sol.new/link/…` (custom codes 0.01 SOL). |
| Receipt | `/receipt/[signature]` | Shareable tx receipt. |

**Gift note:** Claim secret is in the URL `#fragment` only. Anyone with the full link can claim.  
**Short links:** Canonical `/link/<code>`; legacy `/l/<code>` redirects 308.

---

## Yield and staking

| Feature | Path | One-liner |
|---------|------|-----------|
| Earn | `/earn` | Protected USDC yield (passkey deposit/withdraw). |
| Loan | `/loan` | Supply for APY or borrow vs collateral (Jupiter Lend). |
| Stake SOL | `/stake` | Native validator staking. |
| Liquid stake | `/lst` | jitoSOL, mSOL, INF, more. |

**Loan notes:** Mainnet only. SOL markets auto wrap/unwrap WSOL. Balance check + slider/presets. Liquidation risk — not financial advice.

---

## Fair Draw

| Feature | Path | One-liner |
|---------|------|-----------|
| Fair Draw hub | `/draw` | Wheel, 1–N, coin, dice. |
| Shortcuts | `/wheel` `/flip` `/dice` | Mode deep-links. |
| Draw receipt | `/draw/[id]` | Seed, hashes, slot. |
| Legacy | `/vrf` | → `/draw`. |

---

## Explore and research

| Feature | Path | One-liner |
|---------|------|-----------|
| Scan / track | `/scan` `/track` | Wallet, token, program lookup. |
| Lists | `/lists` | Watchlists and quotes. |
| Stocks | `/stocks` | Stocks on Solana. |
| Gallery | `/gallery` | Token gallery. |
| Compare | `/compare` | Side-by-side products / tokens. |
| Creator | `/creator/[wallet]` | Profile; edit `/creator/edit`. |
| Username profile | `/u/[username]` | Public @handle → creator. |
| News / pods | `/news` `/pods` | Headlines and podcasts. |
| Punt | `/punt` | Free-to-play picks. |
| What's new | `/whats-new` | Recent launches. |

---

## Site and meta

| Feature | Path | One-liner |
|---------|------|-----------|
| Home | `/` `/home` | Product grid / tour. |
| Directory | `/dir` | Everything + external Solana links. |
| Features | `/features` | This overview as a page. |
| Docs | `/docs` | Costs, storage, APIs. |
| Changelog | `/changelog` | Product history. |
| Privacy / Terms | `/privacy` `/terms` | Legal. |

---

## API surfaces (selected)

| Endpoint | Use |
|----------|-----|
| `GET /api/costs` | Live action costs (docs). |
| `GET /api/stats` | Aggregate counts. |
| `POST /api/gift/create` | Unsigned gift funding tx + claim secret/URL. |
| `POST /api/gift` | Register gift after on-chain fund. |
| `GET /api/gift?pk=` | Gift status (`token`, amount, status). |
| `PATCH /api/gift` | Claimed / reclaimed. |
| `GET/POST /api/loan` | Lend markets + deposit/withdraw/operate txs. |
| `GET/POST /api/link` | Create / resolve short links. |
| `GET/POST /api/creator/profile` | Profile + `?check=` username availability. |
| `POST /api/draw` | Fair draw. |
| `GET /api/receipt?signature=` | Parsed tx for receipts. |

Full product APIs also cover token, NFT, multisig, lists, launch, scan, subscribe, LST, etc.

### Gift create (integrators)

```http
POST /api/gift/create
Content-Type: application/json

{
  "wallet": "<sender base58>",
  "amount": 0.05,
  "token": "SOL",
  "network": "mainnet",
  "message": "optional"
}
```

Returns `transaction` (base64), `secret`, `claimUrl`, `giftPubkey`, `register`.  
Sign & send → `POST /api/gift` with `register.body`.  
Secret is **never** stored on the server.

---

## Networks

- **Mainnet (live)** — real SOL; fees per `/docs`.
- **Devnet** — test mode in nav; loan markets mainnet-only.

---

## Principles

1. **Passkey first** — create without seed phrases.
2. **Shareable links** — gifts, pays, receipts, draws, short links.
3. **Low friction** — short paths, mobile-friendly, PWA-ready.
4. **Honest product** — gift links are bearer secrets; fair draws document entropy; loan shows risk.

---

## Quick map

```
sol.new
├── create     token · nft · multisig · id
├── wallet     wallet · get · send · portfolio · burn
├── money      pay · split · gift · claim · receipt · link
├── yield      earn · loan · stake · lst
├── draw       draw · wheel · flip · dice
├── explore    scan · lists · launch · stocks · gallery · u/@name
└── meta       dir · features · docs · changelog · llms.txt
```

*Prefer live `/dir` and `/features` if paths drift.*
