import { NextRequest, NextResponse } from "next/server";
import { creditWalletFromStripe, initDb } from "@/lib/db";
import { CREDIT_PACK_CREDITS, creditsConfigured } from "@/lib/credits";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envVar(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (v) return v;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const ctx = getCloudflareContext();
    const x = ctx?.env?.[name];
    if (typeof x === "string" && x.trim()) return x.trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Stripe webhook — credits packs.
 * Dashboard URL: https://sol.new/api/stripe/webhook
 * Event: checkout.session.completed
 *
 * Signature verified with Stripe's constructEvent via dynamic import only when
 * secret is set; otherwise accept is disabled.
 */
export async function POST(req: NextRequest) {
  if (!creditsConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret =
    envVar("STRIPE_WEBHOOK_SECRET") || envVar("STRIPE_CREDITS_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();

  // Lazy import stripe for signature only
  const Stripe = (await import("stripe")).default;
  const key = envVar("STRIPE_SECRET_KEY");
  if (!key) {
    return NextResponse.json({ error: "no key" }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret) as typeof event;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bad signature";
    console.error("[stripe/webhook] sig", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        payment_status?: string;
        metadata?: Record<string, string>;
        client_reference_id?: string | null;
        amount_total?: number | null;
        currency?: string | null;
      };

      if (session.payment_status && session.payment_status !== "paid") {
        return NextResponse.json({ ok: true, skipped: "not_paid" });
      }

      const wallet = session.metadata?.wallet || session.client_reference_id || "";
      const product = session.metadata?.product || "";
      if (!wallet || product !== "credits_pack_aud_5") {
        return NextResponse.json({ ok: true, skipped: "not_credits" });
      }

      const delta = Number(
        session.metadata?.credit_cents || session.amount_total || CREDIT_PACK_CREDITS,
      );

      await initDb();
      const { balanceCents, applied } = await creditWalletFromStripe({
        wallet,
        deltaCents: delta,
        stripeSessionId: session.id,
        note: `A$${(delta / 100).toFixed(2)} credits pack`,
      });

      if (applied) {
        notifyEvent({
          kind: "credits_purchase",
          title: "Credits purchased",
          fields: {
            wallet,
            sessionId: session.id,
            credits: String(delta),
            balance: String(balanceCents),
            currency: session.currency || "aud",
          },
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true, applied, balanceCents });
    }

    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (e) {
    console.error("[stripe/webhook]", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
