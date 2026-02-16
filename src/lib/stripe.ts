/**
 * Stripe integration for Apple Pay / Google Pay
 * SOL purchase flow for sol.new
 */

import Stripe from 'stripe';

// Lazy-load Stripe (only at request time, never at build time)
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
 */
export async function createPaymentIntent(
  amountUsd: number,
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return await stripe.paymentIntents.create({
    amount: amountUsd,
    currency: 'usd',
    payment_method_types: ['card'], // Apple Pay/Google Pay work via 'card'
    metadata: metadata || {},
  });
}

/**
 * Get current SOL/USD price (TODO: integrate real API)
 */
export async function getSolPrice(): Promise<number> {
  return 150; // $150/SOL hardcoded for now
}

/**
 * Calculate SOL amount after Stripe fees
 */
export function calculateSolAmount(usdAmount: number, solPrice: number): number {
  const stripeFee = 0.029; // 2.9% + $0.30
  const netAmount = (usdAmount / 100) * (1 - stripeFee) - 0.30;
  return netAmount / solPrice;
}
