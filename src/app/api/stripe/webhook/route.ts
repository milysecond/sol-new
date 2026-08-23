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

type SessionLike = {
  id: string;
  payment_status?: string;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
};

function packDelta(session: SessionLike): number {
  const fromMeta = Number(session.metadata?.credit_cents || session.metadata?.credits || 0);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return Math.floor(fromMeta);
  const total = Number(session.amount_total || 0);
  if (Number.isFinite(total) && total > 0) return Math.floor(total);
  return CREDIT_PACK_CREDITS;
}

async function applyCreditsSession(session: SessionLike): Promise<{
  ok: true;
  applied: boolean;
  balanceCents: number;
  skipped?: string;
} | { ok: false; skipped: string }> {
  const paid =
    !session.payment_status ||
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  if (!paid) return { ok: false, skipped: `not_paid:${session.payment_status}` };

  const wallet = (session.metadata?.wallet || session.client_reference_id || "").trim();
  const product = (session.metadata?.product || "").trim();
  if (!wallet) return { ok: false, skipped: "no_wallet" };
  // Accept known pack product; also credit if wallet present and amount matches pack
  if (product && product !== "credits_pack_aud_5") {
    return { ok: false, skipped: `not_credits:${product}` };
  }
  if (!product && packDelta(session) !== CREDIT_PACK_CREDITS && packDelta(session) !== 500) {
    return { ok: false, skipped: "unknown_product" };
  }

  const delta = packDelta(session);
  await initDb();
  const { balanceCents, applied } = await creditWalletFromStripe({
    wallet,
    deltaCents: delta,
    stripeSessionId: session.id,
    note: `A$${(delta / 100).toFixed(2)} credits pack`,
  });
  return { ok: true, applied, balanceCents };
}

/**
 * Stripe webhook — credits packs.
 * Dashboard: https://sol.new/api/stripe/webhook
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded
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

  const Stripe = (await import("stripe")).default;
  const key = envVar("STRIPE_SECRET_KEY") || envVar("STRIPE_SECRET");
  if (!key) {
    return NextResponse.json({ error: "no key" }, { status: 503 });
  }
  const stripe = new Stripe(key, { apiVersion: "2026-01-28.clover" });

  let event: { type: string; data: { object: Record<string, unknown> }; id?: string };
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret) as unknown as typeof event;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bad signature";
    console.error("[stripe/webhook] sig", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as unknown as SessionLike;
      const result = await applyCreditsSession(session);
      if (!result.ok) {
        return NextResponse.json({ ok: true, skipped: result.skipped });
      }
      if (result.applied) {
        const wallet = (session.metadata?.wallet || session.client_reference_id || "").trim();
        notifyEvent(
          {
            kind: "credits_purchase",
            title: "Credits purchased",
            fields: {
              wallet,
              sessionId: session.id,
              credits: String(packDelta(session)),
              balance: String(result.balanceCents),
              currency: session.currency || "aud",
              via: event.type,
            },
          },
          { req },
        ).catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        applied: result.applied,
        balanceCents: result.balanceCents,
      });
    }

    // Backup: payment_intent succeeded with our metadata (if Checkout webhook missed)
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as {
        id: string;
        metadata?: Record<string, string>;
        amount?: number;
        currency?: string;
      };
      const product = pi.metadata?.product || "";
      const wallet = (pi.metadata?.wallet || "").trim();
      if (product === "credits_pack_aud_5" && wallet) {
        const delta = Number(pi.metadata?.credit_cents || pi.amount || CREDIT_PACK_CREDITS);
        await initDb();
        // Use pi id as pseudo session if no cs_ id — still idempotent
        const { balanceCents, applied } = await creditWalletFromStripe({
          wallet,
          deltaCents: delta > 0 ? delta : CREDIT_PACK_CREDITS,
          stripeSessionId: `pi:${pi.id}`,
          note: "A$5 credits pack (payment_intent)",
        });
        return NextResponse.json({ ok: true, applied, balanceCents, via: "pi" });
      }
    }

    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (e) {
    console.error("[stripe/webhook]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "handler failed" },
      { status: 500 },
    );
  }
}
