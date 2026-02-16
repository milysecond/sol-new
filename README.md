# sol.new

**Zero-friction Solana creation platform.** Launch tokens, mint NFTs, create multisigs, and fund wallets—all in seconds, with just a passkey.

🌐 **Website**: [sol.new](https://sol.new)  
🔐 **Passkey-secured** • 💸 **Low fees** • ⚡ **Instant**

---

## What is sol.new?

sol.new removes the complexity from Solana. No wallet downloads, no seed phrases, no gas management. Just create and go.

**Features:**
- 🪙 **Token Launcher** — Deploy SPL tokens with Meteora bonding curves
- 🖼️ **NFT Minter** — Standard or compressed NFTs via Metaplex
- 👥 **Multisig Creator** — Squads v4 multisig wallets
- 💳 **Instant Wallet** — WebAuthn passkey-secured wallets
- 💰 **SOL Onramp** — Fund wallets instantly
- 🔄 **Auto-swap** — Built-in Jupiter integration

---

## Pricing

### Token Launches
- **~0.05 SOL** to create token + pool
- Trading fees: 2.5% → 1% over 24h (goes to creator)
- Migration fee: 1% at graduation (goes to creator)

### NFTs
- **Standard NFT:** ~0.01 SOL (network rent)
- **Compressed NFT:** ~0.0001 SOL (shared tree)

### Multisig
- **0.05 SOL total** to create
  - 0.04 SOL: Network rent (Squads program)
  - 0.01 SOL: Platform fee

### Wallets
- **Free** passkey creation
- **Free** first transaction (rent-exempt funding)
- SOL purchases: Provider fees apply (Moonpay/Ramp)

---

## Fee Structure

### Token Launches (Meteora DBC)

sol.new uses **Meteora Dynamic Bonding Curve** for fair token launches:

**Trading Fees:**
- Starts at **2.5%**, decreases to **1%** over 24 hours
- 100% of trading fees go to **token creator**
- Collected in SOL (quote currency)

**Migration Fees:**
- **1% fee** when bonding curve graduates to Meteora DAMM v2
- 100% of migration fees go to **token creator**

**Launch Parameters:**
- Initial market cap: ~$300 (1.5 SOL at $200/SOL)
- Migration market cap: $750 (3.75 SOL)
- Pool creation: **0 SOL** (free)

### Multisig Creation

- **0.01 SOL fee** per multisig (from 0.05 SOL creation cost)
- Uses Squads v4 protocol

### NFT Minting

- **No platform fees**
- Creator pays only network rent (~0.01 SOL for standard NFTs)
- Compressed NFTs use shared Bubblegum tree

### Wallet Operations

- Passkey wallet creation: **Free**
- SOL purchases: Provider fees apply (Moonpay/Ramp)

---

## Treasury

**Address:** `nEWKinAMMZv3zyHKSaLLyWsw6JBdbpES8ktgRnf6Tzf`

All platform fees are collected to this treasury address. Fees fund:
- Platform development and maintenance
- Shared infrastructure (Bubblegum trees, RPC nodes)
- Future feature development

---

## Tech Stack

- **Frontend:** Next.js 16 (App Router + Turbopack)
- **Wallet:** WebAuthn passkeys via [@solana/passkeys](https://github.com/solana-developers/solana-passkeys)
- **Token Launches:** [Meteora Dynamic Bonding Curve SDK](https://github.com/MeteoraAg/dlmm-sdk)
- **NFTs:** [Metaplex Umi](https://github.com/metaplex-foundation/umi) + Bubblegum (compressed)
- **Multisig:** [Squads v4](https://github.com/Squads-Protocol/v4)
- **Swap:** [Jupiter API](https://station.jup.ag/docs)
- **Analytics:** Vercel Analytics (privacy-friendly)

---

## Development

### Prerequisites

- Node.js 18+
- npm/pnpm/yarn

### Environment Variables

Create `.env.local`:

```env
# RPC (Helius recommended for compressed NFTs)
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_API_KEY=your_helius_key

# Meteora Partner Config (mainnet/devnet)
NEXT_PUBLIC_DBC_PARTNER_CONFIG=your_config_pubkey

# Bubblegum Tree (for compressed NFTs)
NEXT_PUBLIC_BUBBLEGUM_TREE=your_tree_pubkey

# Squads Multisig Treasury (mainnet)
NEXT_PUBLIC_SQUADS_TREASURY=your_multisig_pubkey

# Image Generation (optional)
POLLINATIONS_API_KEY=your_key

# Onramp Providers (optional)
MOONPAY_API_KEY=your_key
RAMP_API_KEY=your_key
```

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
npm start
```

### Scripts

```bash
# Create Meteora partner config
npx tsx scripts/create-partner-config.ts [mainnet|devnet]

# Create Bubblegum tree for compressed NFTs
npx tsx scripts/create-tree.ts

# Create Squads multisig
npx tsx scripts/create-multisig.ts [mainnet|devnet]

# Grind vanity keypairs
npx tsx scripts/grind-keys.ts --prefix NEW --count 10
```

---

## Architecture

### Passkey Wallets

sol.new uses WebAuthn passkeys to create Solana wallets:
1. User creates passkey (biometric/device authentication)
2. Passkey derives ed25519 keypair deterministically
3. Keypair becomes Solana wallet (no seed phrase needed)
4. Transactions signed client-side via passkey challenge

### Token Launch Flow

1. User enters token details (name, symbol, supply, image)
2. Token metadata uploaded to Arweave via Irys
3. Meteora DBC pool created with partner config
4. Token mint + pool creation in atomic transaction
5. Bonding curve active immediately
6. Graduates to Meteora DAMM v2 at $750 market cap

### NFT Minting

**Standard NFTs:**
- Metaplex Token Metadata standard
- Image uploaded to Arweave
- Metadata URI stored on-chain

**Compressed NFTs:**
- Metaplex Bubblegum (state compression)
- Shared public tree (16,384 NFT capacity)
- ~1000x cheaper than standard NFTs

---

## Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/metasal1/sol-new)

1. Connect GitHub repo
2. Add environment variables
3. Deploy

### Self-Hosted

```bash
npm run build
npm start
# or
docker build -t sol-new .
docker run -p 3000:3000 sol-new
```

---

## Security

- ✅ Passkeys secured by device biometrics
- ✅ No seed phrases stored anywhere
- ✅ Client-side transaction signing
- ✅ HTTPS required (enforced by passkeys)
- ✅ No backend database (stateless)

**Responsible Disclosure:**  
Found a security issue? Email: security@sol.new

---

## Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create feature branch
3. Test thoroughly
4. Submit PR with description

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Links

- **Website:** https://sol.new
- **Twitter:** [@soldotnew](https://x.com/soldotnew)
- **GitHub:** https://github.com/milysecond/sol-new

---

Built with ❤️ for the Solana ecosystem.
