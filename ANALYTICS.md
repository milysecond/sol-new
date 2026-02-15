# Vercel Analytics Setup

## Overview

sol.new uses Vercel Analytics for tracking user behavior and custom events.

## Installation

Already installed via:
```bash
npm install @vercel/analytics
```

## Usage

### Automatic Page Views

Page views are automatically tracked via the `<Analytics />` component in the root layout.

### Custom Event Tracking

Use the `analytics` helper from `@/lib/analytics`:

```typescript
import { analytics } from "@/lib/analytics";

// Track wallet events
analytics.walletCreated();
analytics.walletRecovered();
analytics.walletConnected("passkey");

// Track token creation
analytics.tokenCreated({
  hasImage: true,
  meteora: true,
  network: "mainnet"
});

// Track NFT minting
analytics.nftMinted({
  compressed: false,
  hasImage: true,
  network: "mainnet"
});

// Track multisig creation
analytics.multisigCreated({
  threshold: 2,
  members: 3,
  network: "mainnet"
});

// Track SOL purchases
analytics.solPurchased({
  amount: 0.1,
  provider: "stripe",
  network: "mainnet"
});

// Track network switches
analytics.networkSwitched("devnet");

// Track errors
analytics.error("token-creation", "Insufficient SOL for fees");

// Track custom features
analytics.featureUsed("ai_image_generation", { prompt: "..." });
```

## Available Events

- `wallet_created` - New wallet created via passkey
- `wallet_recovered` - Wallet recovered via passkey
- `wallet_connected` - Wallet connected (passkey or recovery)
- `token_created` - Token launched
- `token_image_generated` - AI image generated for token
- `nft_minted` - NFT minted
- `nft_image_generated` - AI image generated for NFT
- `multisig_created` - Multisig wallet created
- `sol_purchased` - SOL purchased via Stripe
- `sol_sent` - SOL sent to another wallet
- `network_switched` - Switched between mainnet/devnet
- `error` - Error occurred
- `feature_*` - Custom feature usage

## Viewing Analytics

Analytics are available in the Vercel dashboard:
1. Go to vercel.com
2. Select the sol.new project
3. Click "Analytics" in the sidebar

## Privacy

Vercel Analytics respects user privacy and doesn't use cookies. All data is anonymized and aggregated.
