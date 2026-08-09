import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { creditWalletFromStripe, initDb } from "@/lib/db";
import { CREDIT_PACK_CREDITS } from "@/lib/credits";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — credits packs + future payment events.
 * Dashboard: https://sol.new/api/stripe/webhook
 * Events: checkout.session.completed
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const secret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    process.env.STRIPE_CREDITS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
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

      const wallet =
        session.metadata?.wallet ||
        session.client_reference_id ||
        "";
      const product = session.metadata?.product || "";
      if (!wallet || product !== "credits_pack_aud_5") {
        return NextResponse.json({ ok: true, skipped: "not_credits" });
      }

      const credits = Number(session.metadata?.credits || CREDIT_PACK_CREDITS);
      const delta = Number(session.metadata?.credit_cents || session.amount_total || credits);

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
