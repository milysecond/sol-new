/**
 * Stripe helpers (server-only).
 * Crypto Onramp is public preview — use rawRequest for /v1/crypto/onramp_sessions.
 *
 * Env:
 *   STRIPE_SECRET_KEY              — sk_live_… / sk_test_… (Worker secret)
 *   STRIPE_PUBLISHABLE_KEY         — pk_live_… / pk_test_… (Worker secret or var)
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — same pk (optional; client can load from API)
 */

import Stripe from "stripe";

function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const ctx = getCloudflareContext();
    const v = ctx?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* not in CF request context */
  }
  return undefined;
}

let stripeInstance: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(envVar("STRIPE_SECRET_KEY"));
}

export function stripePublishableKey(): string | undefined {
  return (
    envVar("STRIPE_PUBLISHABLE_KEY") ||
    envVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") ||
    undefined
  );
}

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = envVar("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripeInstance = new Stripe(key, {
      apiVersion: "2026-01-28.clover",
    });
  }
  return stripeInstance;
}

export type OnrampAsset = "usdc" | "sol";

export type CreateOnrampSessionOpts = {
  wallet: string;
  /** Fiat USD the user intends to spend (optional; user can change in widget). */
  sourceAmountUsd?: string;
  asset?: OnrampAsset;
  customerIp?: string;
  metadata?: Record<string, string>;
};

export type OnrampSessionResult = {
  id: string;
  clientSecret: string;
  /** Stripe-hosted checkout at crypto.link.com (works without publishable key). */
  redirectUrl: string | null;
  status: string;
  livemode: boolean;
};

/**
 * Mint a crypto onramp session locked to Solana + the user's passkey wallet.
 * Stripe hosts KYC + Apple Pay / card / bank inside the widget.
 */
export async function createCryptoOnrampSession(
  opts: CreateOnrampSessionOpts,
): Promise<OnrampSessionResult> {
  const stripe = getStripe();
  const asset: OnrampAsset = opts.asset === "sol" ? "sol" : "usdc";

  const params: Record<string, unknown> = {
    wallet_addresses: { solana: opts.wallet },
    lock_wallet_address: true,
    destination_networks: ["solana"],
    destination_currencies: [asset],
    destination_network: "solana",
    destination_currency: asset,
    source_currency: "usd",
  };

  if (opts.sourceAmountUsd) {
    params.source_amount = opts.sourceAmountUsd;
  }
  if (opts.customerIp) {
    params.customer_ip_address = opts.customerIp;
  }
  if (opts.metadata) {
    params.metadata = opts.metadata;
  }

  // Onramp API is preview — not typed on stripe-node yet.
  const session = (await stripe.rawRequest(
    "POST",
    "/v1/crypto/onramp_sessions",
    params,
  )) as {
    id?: string;
    client_secret?: string;
    redirect_url?: string | null;
    status?: string;
    livemode?: boolean;
    error?: { message?: string; code?: string };
  };

  if (!session?.client_secret || !session?.id) {
    throw new Error(
      (session as { error?: { message?: string } })?.error?.message ||
        "Stripe did not return an onramp client secret",
    );
  }

  return {
    id: session.id,
    clientSecret: session.client_secret,
    redirectUrl: session.redirect_url || null,
    status: session.status || "initialized",
    livemode: Boolean(session.livemode),
  };
}

/** Create payment intent for fiat checkout (legacy; not used for crypto delivery). */
export async function createPaymentIntent(
  amountUsd: number,
  metadata?: Record<string, string>,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return await stripe.paymentIntents.create({
    amount: amountUsd,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: metadata || {},
  });
}
