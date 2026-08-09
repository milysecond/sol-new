/**
 * sol.new Credits — fiat packs via Stripe Checkout (Apple Pay works in AU).
 * Not crypto on-ramp. $5 AUD pack → 500 credits (1 credit = 1¢ AUD).
 *
 * Uses form POST via fetch so it works on Cloudflare Workers
 * (stripe-node can hang under workerd).
 */

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
    /* ignore */
  }
  return undefined;
}

export const CREDIT_PACK_AUD_CENTS = 500; // A$5.00
export const CREDIT_PACK_CREDITS = 500; // 1 credit = 1 cent AUD
export const CREDIT_CURRENCY = "aud" as const;

export function creditsConfigured(): boolean {
  return Boolean(envVar("STRIPE_SECRET_KEY"));
}

export async function createCreditsCheckoutSession(opts: {
  wallet: string;
  origin: string;
  customerEmail?: string;
}): Promise<{ url: string; sessionId: string }> {
  const key = envVar("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const success = `${opts.origin}/get?credits=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${opts.origin}/get?credits=cancel`;

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", success);
  body.set("cancel_url", cancel);
  body.set("client_reference_id", opts.wallet.slice(0, 200));
  body.set("billing_address_collection", "auto");
  body.set("allow_promotion_codes", "false");

  // Line item — A$5 credits pack
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", CREDIT_CURRENCY);
  body.set("line_items[0][price_data][unit_amount]", String(CREDIT_PACK_AUD_CENTS));
  body.set("line_items[0][price_data][product_data][name]", "sol.new Credits");
  body.set(
    "line_items[0][price_data][product_data][description]",
    `${CREDIT_PACK_CREDITS} credits for sol.new (fees, links, drops). Non-refundable digital credit.`,
  );
  body.set(
    "line_items[0][price_data][product_data][images][0]",
    "https://sol.new/icon-512.png",
  );

  body.set("metadata[wallet]", opts.wallet.slice(0, 64));
  body.set("metadata[product]", "credits_pack_aud_5");
  body.set("metadata[credits]", String(CREDIT_PACK_CREDITS));
  body.set("metadata[credit_cents]", String(CREDIT_PACK_AUD_CENTS));

  body.set("payment_intent_data[metadata][wallet]", opts.wallet.slice(0, 64));
  body.set("payment_intent_data[metadata][product]", "credits_pack_aud_5");

  if (opts.customerEmail) {
    body.set("customer_email", opts.customerEmail.slice(0, 256));
  }

  // Enable wallet payments (Apple Pay / Google Pay) via automatic methods
  body.set("payment_method_types[0]", "card");
  // Link helps returning customers
  body.set("payment_method_types[1]", "link");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `credits-${opts.wallet.slice(0, 20)}-${Date.now()}`.slice(0, 64),
    },
    body: body.toString(),
  });

  const session = (await res.json()) as {
    id?: string;
    url?: string | null;
    error?: { message?: string };
  };

  if (!res.ok || !session.url || !session.id) {
    throw new Error(session.error?.message || `Stripe Checkout failed (${res.status})`);
  }

  return { url: session.url, sessionId: session.id };
}

export async function retrieveCheckoutSession(sessionId: string): Promise<{
  id: string;
  payment_status: string;
  metadata: Record<string, string>;
  client_reference_id: string | null;
  amount_total: number | null;
  currency: string | null;
}> {
  const key = envVar("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
    },
  );
  const session = (await res.json()) as {
    id?: string;
    payment_status?: string;
    metadata?: Record<string, string>;
    client_reference_id?: string | null;
    amount_total?: number | null;
    currency?: string | null;
    error?: { message?: string };
  };
  if (!res.ok || !session.id) {
    throw new Error(session.error?.message || `Retrieve failed (${res.status})`);
  }
  return {
    id: session.id,
    payment_status: session.payment_status || "unpaid",
    metadata: session.metadata || {},
    client_reference_id: session.client_reference_id ?? null,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
  };
}
