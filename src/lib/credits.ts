/**
 * sol.new Credits — fiat packs via Stripe Checkout (Apple Pay works in AU).
 * Not crypto on-ramp. $5 AUD pack → 500 credits (1 credit = 1¢ AUD).
 */

import { getStripe, stripeConfigured } from "@/lib/stripe";

export const CREDIT_PACK_AUD_CENTS = 500; // A$5.00
export const CREDIT_PACK_CREDITS = 500; // 1 credit = 1 cent AUD
export const CREDIT_CURRENCY = "aud" as const;

export function creditsConfigured(): boolean {
  return stripeConfigured();
}

export async function createCreditsCheckoutSession(opts: {
  wallet: string;
  origin: string;
  customerEmail?: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const success = `${opts.origin}/get?credits=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${opts.origin}/get?credits=cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // automatic_payment_methods enables Apple Pay / Google Pay / cards where available
    // (AU included for standard Checkout — not crypto onramp)
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CREDIT_CURRENCY,
          unit_amount: CREDIT_PACK_AUD_CENTS,
          product_data: {
            name: "sol.new Credits",
            description: `${CREDIT_PACK_CREDITS} credits for sol.new (sponsored fees, links, drops). Non-refundable digital credit.`,
            images: ["https://sol.new/icon-512.png"],
          },
        },
      },
    ],
    success_url: success,
    cancel_url: cancel,
    client_reference_id: opts.wallet.slice(0, 200),
    customer_email: opts.customerEmail || undefined,
    metadata: {
      wallet: opts.wallet.slice(0, 64),
      product: "credits_pack_aud_5",
      credits: String(CREDIT_PACK_CREDITS),
      credit_cents: String(CREDIT_PACK_AUD_CENTS),
    },
    payment_intent_data: {
      metadata: {
        wallet: opts.wallet.slice(0, 64),
        product: "credits_pack_aud_5",
      },
    },
    // Help Apple Pay show on Safari
    billing_address_collection: "auto",
    allow_promotion_codes: false,
  });

  if (!session.url || !session.id) {
    throw new Error("Stripe Checkout did not return a URL");
  }
  return { url: session.url, sessionId: session.id };
}
