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
 * Stripe hosts KYC + Apple Pay / card / bank. Uses form POST via fetch so it
 * works on Cloudflare Workers (stripe-node rawRequest can hang there).
 */
export async function createCryptoOnrampSession(
  opts: CreateOnrampSessionOpts,
): Promise<OnrampSessionResult> {
  const key = envVar("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const asset: OnrampAsset = opts.asset === "sol" ? "sol" : "usdc";
  const body = new URLSearchParams();
  body.set("wallet_addresses[solana]", opts.wallet);
  body.set("lock_wallet_address", "true");
  body.set("destination_networks[0]", "solana");
  body.set("destination_currencies[0]", asset);
  body.set("destination_network", "solana");
  body.set("destination_currency", asset);
  body.set("source_currency", "usd");
  if (opts.sourceAmountUsd) body.set("source_amount", opts.sourceAmountUsd);
  if (opts.customerIp) body.set("customer_ip_address", opts.customerIp);
  if (opts.metadata) {
    for (const [k, v] of Object.entries(opts.metadata)) {
      if (v) body.set(`metadata[${k}]`, v.slice(0, 500));
    }
  }

  const res = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe prefers Idempotency-Key for creates
      "Idempotency-Key": `onramp-${opts.wallet.slice(0, 16)}-${asset}-${opts.sourceAmountUsd || "open"}-${Date.now()}`.slice(
        0,
        64,
      ),
    },
    body: body.toString(),
  });

  const session = (await res.json()) as {
    id?: string;
    client_secret?: string;
    redirect_url?: string | null;
    status?: string;
    livemode?: boolean;
    error?: { message?: string; code?: string; type?: string };
  };

  if (!res.ok || !session?.client_secret || !session?.id) {
    throw new Error(
      session.error?.message ||
        `Stripe onramp failed (${res.status})`,
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
