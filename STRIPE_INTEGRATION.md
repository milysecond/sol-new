# Stripe Integration - Apple Pay / Google Pay

## Setup

1. **Get Stripe API keys** from https://dashboard.stripe.com/apikeys
   - Secret key (starts with `sk_`)
   - Publishable key (starts with `pk_`)

2. **Save secret key:**
   ```bash
   echo "sk_test_..." > ~/.credentials/stripe.txt
   ```

3. **Add publishable key to .env.local:**
   ```env
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. **Configure webhook** in Stripe dashboard:
   - URL: `https://sol.new/api/payment/webhook`
   - Events: `payment_intent.succeeded`

## Flow

1. **User initiates payment** (Apple Pay / Google Pay)
   - Frontend calls `/api/payment/create-intent`
   - Returns `clientSecret` + SOL amount

2. **User completes payment**
   - Stripe processes payment
   - Sends webhook to `/api/payment/webhook`

3. **Webhook handler triggers:**
   - Transfer SOL to user wallet
   - If token params included → launch token via Meteora

## Frontend Component

```tsx
import { loadStripe } from '@stripe/stripe-js';
import { PaymentElement } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Apple Pay / Google Pay shows automatically if supported
```

## TODO

- [ ] Integrate real SOL price feed (Jupiter API)
- [ ] Handle SOL transfer on payment success
- [ ] Integrate Meteora token launch
- [ ] Add payment UI component
- [ ] Test Apple Pay / Google Pay
- [ ] Set up production webhook

## Fees

- Stripe: 2.9% + $0.30 per transaction
- Apple Pay/Google Pay: No additional fee (included in Stripe)
- Minimum: $1.00 ($100 cents)

## Security

- API key stored in `~/.credentials/stripe.txt` (never committed)
- Webhook signature verification prevents replay attacks
- All amounts in cents (no floating point issues)
