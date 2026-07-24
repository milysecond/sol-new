# Analytics Setup

sol.new uses **GA4** (and optionally Umami) for product analytics. There is no Vercel Analytics dependency; the app deploys on Cloudflare.

## Tracking Events

Custom event tracking is handled via `/src/lib/analytics.ts` (GA4 `gtag`).

### Active Events

- `token_created` - Token minted on Meteora DBC
- `nft_created` - NFT/cNFT created
- `wallet_created` - Passkey wallet created
- `multisig_created` - Squads multisig created
- `payment_link_created` - Payment link generated
- `dao_created` - DAO/organization created
- `launch_initiated` - Token launch started
- `launch_completed` - Launch finalized
- `network_switched` - Mainnet/devnet toggle
- `wallet_connected` - Wallet connection
- `theme_toggled` - Light/dark mode
- `share_clicked` - Share button clicked

### Usage

```typescript
import { analytics } from '@/lib/analytics';

// Convenience functions
analytics.tokenCreated(mintAddress, 'TICKER');
analytics.walletCreated(address);
analytics.networkSwitched('mainnet');

// Generic tracking
import { track } from '@/lib/analytics';
track('custom_event', { key: 'value' });
```

## Dashboards

- **GA4**: configured via `NEXT_PUBLIC_GA_ID` (layout loads gtag)
- **Umami** (optional): https://stats.sal.fun if the script is enabled in layout

## Privacy

- No PII is tracked
- Wallet addresses are pseudonymous identifiers
- Prefer not storing raw IPs in product analytics
