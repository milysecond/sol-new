# Analytics Setup

sol.new uses **dual analytics tracking** with Umami (self-hosted) and Vercel Analytics.

## 🎯 Tracking Events

Custom event tracking is handled via `/src/lib/analytics.ts`. Both platforms receive the same events automatically.

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

## 📊 Dashboards

- **Umami**: https://stats.sal.fun (website ID: `2fd088a3-f7b5-486c-9b38-6c0f50ec5d9e`)
- **Vercel**: https://vercel.com/analytics (project dashboard)

## 🔧 Configuration

### Umami (Self-Hosted)
```tsx
// In layout.tsx <head>
<script 
  defer 
  src="https://stats.sal.fun/script.js" 
  data-website-id="2fd088a3-f7b5-486c-9b38-6c0f50ec5d9e" 
/>
```

### Vercel Analytics
```tsx
// In layout.tsx <body>
import { Analytics } from '@vercel/analytics/react';
<Analytics />
```

## 🛠️ Adding New Events

1. Add event name to `AnalyticsEvent` type in `/src/lib/analytics.ts`
2. Optionally create a convenience function in the `analytics` object
3. Call `track('event_name', { data })` where needed
4. Both Umami and Vercel will receive the event automatically

## 🚫 Privacy

- No PII is tracked
- Wallet addresses are pseudonymous identifiers
- IP addresses are not stored (Umami config)
- Complies with GDPR/privacy best practices
