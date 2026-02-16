/**
 * Stripe integration for Apple Pay / Google Pay
 * Handles SOL purchase → token launch flow
 */

import Stripe from 'stripe';

// Lazy-load Stripe instance (only when needed, not at build time)
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable not set');
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2026-01-28.clover',
    });
  }
  return stripeInstance;
}

/**
 * Create payment intent for SOL purchase
 * @param amountUsd Amount in USD cents (e.g. 1000 = $10.00)
 * @param metadata Optional metadata (user wallet, token params, etc.)
 */
export async function createPaymentIntent(
  amountUsd: number,
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return await stripe.paymentIntents.create({
    amount: amountUsd,
    currency: 'usd',
    payment_method_types: ['card'], // Apple Pay/Google Pay work via 'card' type
    metadata: metadata || {},
  });
}

/**
 * Get current SOL/USD price (placeholder - integrate real price feed)
 */
export async function getSolPrice(): Promise<number> {
  // TODO: Integrate Jupiter or Coingecko API
  // For now, hardcoded estimate
  return 150; // $150/SOL
}

/**
 * Calculate SOL amount for USD payment (minus fees)
 */
export function calculateSolAmount(usdAmount: number, solPrice: number): number {
  const stripeFee = 0.029; // 2.9% + $0.30
  const netAmount = (usdAmount / 100) * (1 - stripeFee) - 0.30;
  return netAmount / solPrice;
}
