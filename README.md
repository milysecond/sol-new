# sol.new

**Zero-friction Solana creation platform.** Launch tokens, mint NFTs, create multisigs, fund wallets, lend/borrow, and send gifts — all with a passkey.

🌐 **Website**: [sol.new](https://sol.new)  
🔐 **Passkey-secured** · 💸 **Low fees** · ⚡ **Instant**  
📄 **Features**: [FEATURES.md](./FEATURES.md) · [sol.new/features](https://sol.new/features) · [sol.new/dir](https://sol.new/dir)  
🤖 **LLMs**: [llms.txt](https://sol.new/llms.txt) · [llms-full.txt](https://sol.new/llms-full.txt)

---

## What is sol.new?

sol.new removes the complexity from Solana. No wallet downloads, no seed phrases, no gas management. Just create and go.

### Highlights

| Area | Paths |
|------|--------|
| **Create** | `/token` · `/nft` · `/multisig` · `/id` |
| **Wallet** | `/wallet` · `/get` · `/wallet/send` · `/portfolio` · `/burn` |
| **Money** | `/pay` · `/split` · `/gift` · `/claim` · `/receipt` · `/link` |
| **Yield** | `/earn` · `/loan` · `/stake` · `/lst` |
| **Explore** | `/scan` · `/lists` · `/launch` · `/stocks` · `/u/[username]` |
| **Play** | `/draw` · `/punt` |

---

## Pricing (mainnet, approx.)

| Action | Cost |
|--------|------|
| Passkey wallet | Free |
| Token + bonding curve | ~0.05 SOL |
| Standard NFT | ~0.01–0.02 SOL rent |
| Compressed NFT | ~0.001 SOL platform + tiny network |
| Multisig | ~0.05 SOL (incl. 0.01 platform) |
| Custom short link | 0.01 SOL |
| Gift (SOL/USDC) | Gift amount + claim fee float |
| Lend / borrow | Network + protocol rates (Jupiter Lend) |

Live cost table: [sol.new/docs](https://sol.new/docs) · `GET /api/costs`

### Token launches (Meteora DBC)

- Trading fee starts ~2.5% → 1% over 24h → **creator**
- Migration fee 1% at graduation → **creator**
- Pool creation fee: **0 SOL**

---

## Public APIs (selected)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/gift/create` | Build unsigned gift funding tx + one-time claim secret |
| `POST /api/gift` | Register gift status after on-chain fund |
| `GET /api/gift?pk=` | Gift status |
| `PATCH /api/gift` | Mark claimed / reclaimed |
| `GET/POST /api/loan` | Jupiter Lend supply & borrow markets |
| `GET/POST /api/link` | Short links (`sol.new/link/<code>`) |
| `GET/POST /api/creator/profile` | Creator profile + `@username` claim |
| `GET /api/costs` | Live action costs |
| `GET /api/stats` | Aggregate counts |
| `POST /api/draw` | Fair draw |

**Gift create flow**

1. `POST /api/gift/create` `{ wallet, amount, token?, network?, message? }`
2. Sign + send returned `transaction`
3. `POST /api/gift` with `register` body
4. Share `claimUrl` (secret is in the `#fragment` — never stored server-side)

Docs JSON: `GET /api/gift/create` with `Accept: application/json`

---

## Treasury

**Address:** `nEWKinAMMZv3zyHKSaLLyWsw6JBdbpES8ktgRnf6Tzf`

Platform fees fund development, shared trees/RPC, and product work.

---

## Tech stack

- **App:** Next.js 16 (App Router + Turbopack) · OpenNext → **Cloudflare Workers**
- **Wallet:** WebAuthn passkeys → deterministic ed25519 (client-side)
- **Tokens:** Meteora Dynamic Bonding Curve
- **NFTs:** Metaplex Umi + Bubblegum
- **Multisig:** Squads v4
- **Swap / LST / Lend:** Jupiter (+ Lend earn/borrow)
- **DB:** Turso (profiles, gifts registry, short links, draws, …)
- **Images:** R2 / blob via `sol.new/images/…`
- **Analytics:** privacy-friendly product analytics

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Environment

Create `.env.local` / `.dev.vars` (Worker secrets for production):

```env
# RPC — paid Helius Fast + optional Flux (never free public mainnet RPC)
NEXT_PUBLIC_RPC_URL=https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com/
HELIUS_API_KEY=
FLUXRPC_URL=

# Product
JUP_API_KEY=                 # Jupiter Lend / swap
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
CLOUDFLARE_API_TOKEN=        # deploy only

# Meteora / Bubblegum / Squads (as needed)
NEXT_PUBLIC_DBC_PARTNER_CONFIG=
NEXT_PUBLIC_BUBBLEGUM_TREE=
NEXT_PUBLIC_SQUADS_TREASURY=

# Optional onramp / email
MOONPAY_API_KEY=
RESEND_API_KEY=
```

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Deploy (production)

Must be on `main`:

```bash
npm run deploy
```

Secrets: `wrangler secret put <NAME>`. Public vars: `wrangler.jsonc`.

---

## Architecture notes

### Passkey wallets

1. User creates passkey (WebAuthn)
2. PRF / rawId → SHA-256 → `Keypair.fromSeed`
3. Sign client-side; server never holds the seed

### Gifts

- Ephemeral gift keypair; **secret only in claim URL fragment**
- SOL: transfer amount + claim fee reserve
- USDC: ATA + transfer + small SOL float for claim rent

### Short links

- Canonical: `https://sol.new/link/<code>`
- Legacy `/l/<code>` → 308 → `/link/<code>`
- Random codes free; custom codes 0.01 SOL (passkey or Solana Pay QR)

### Loan (`/loan`)

- Jupiter Lend earn (supply) + borrow markets
- Auto wrap/unwrap WSOL for SOL markets
- Balance checks + amount slider/presets

---

## Security

- Passkeys secured by device biometrics
- No seed phrases for passkey wallets
- Client-side transaction signing
- Gift claim secrets are **bearer links** — share privately
- HTTPS required (passkeys)

**Responsible disclosure:** security@sol.new

---

## Links

- **Site:** https://sol.new  
- **X:** [@soldotnew](https://x.com/soldotnew)  
- **Telegram:** https://t.me/soldotnew  
- **GitHub:** https://github.com/milysecond/sol-new  
- **Compare:** https://sol.new/compare  

---

MIT License — see [LICENSE](LICENSE)

Built for the Solana ecosystem.

- `/frame` — LinkedIn profile frame (circular text, #OPENTOSOLANA)
