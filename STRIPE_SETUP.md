# Stripe Integration - Apple Pay / Google Pay

Complete integration for zero-friction SOL purchases via Apple Pay and Google Pay.

## Setup

### 1. Stripe Account
Already configured:
- Secret key: `sk_live_51RimVWA0RVyrUFJy...`
- Publishable key: `pk_live_51RimVWA0RVyrUFJy...`

### 2. Environment Variables

**Vercel (already set):**
```env
STRIPE_SECRET_KEY=sk_live_51RimVWA0RVyrUFJy...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51RimVWA0RVyrUFJy...
STRIPE_WEBHOOK_SECRET=whsec_fvZUzKwzWofrvrk3YRZ4uKBSuKhpqug8
```

**Local development** (add to `.env.local`):
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51RimVWA0RVyrUFJy...
STRIPE_WEBHOOK_SECRET=whsec_auw2EUgFnEcJZwp5df9vyyyPj3C1Yqry
```

### 3. Webhooks

**Production:**
- URL: `https://sol.new/api/payment/webhook`
- Event: `payment_intent.succeeded`
- Secret: `whsec_fvZUzKwzWofrvrk3YRZ4uKBSuKhpqug8`

**Test (test.sol.new):**
- URL: `https://test.sol.new/api/payment/webhook`
- Event: `payment_intent.succeeded`
- Secret: `whsec_auw2EUgFnEcJZwp5df9vyyyPj3C1Yqry`

## Architecture

### Lazy Initialization
**Critical:** Stripe is initialized **at request time**, not build time.

```typescript
// ✅ GOOD: Lazy singleton
let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {...});
  }
  return stripeInstance;
}

// ❌ BAD: Module-level init (causes build failures)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {...});
```

### Flow

1. **User initiates payment**
   - `POST /api/payment/create-intent`
   - Returns `clientSecret` + SOL amount

2. **User completes payment**
   - Stripe processes Apple Pay / Google Pay
   - Redirects to success page

3. **Webhook triggers**
   - `POST /api/payment/webhook`
   - Verifies signature
   - TODO: Transfer SOL to wallet
   - TODO: Launch token (if params provided)

## Usage

```tsx
import PaymentButton from '@/components/PaymentButton';

<PaymentButton
  amountUsd={1000} // $10.00 in cents
  wallet="user-wallet-address"
  onSuccess={() => console.log('Payment complete!')}
/>
```

## Fees

- Stripe: 2.9% + $0.30 per transaction
- Apple Pay/Google Pay: No additional fee
- Minimum: $1.00

## Next Steps

- [ ] Integrate Jupiter API for live SOL/USD price
- [ ] Wire up SOL transfer on payment success
- [ ] Add Meteora token launch flow
- [ ] Test live payment with Apple Pay / Google Pay

## Testing

Build test (no env vars needed):
```bash
npm run build  # Should pass
```

Local test with env vars:
```bash
STRIPE_SECRET_KEY=sk_test_... npm run dev
```
