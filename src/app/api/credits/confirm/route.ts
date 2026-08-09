import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { creditWalletFromStripe, getCreditBalanceCents, initDb } from "@/lib/db";
import { CREDIT_PACK_CREDITS } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { sessionId, wallet }
 * Client fallback when returning from Checkout — credits if paid (idempotent).
 * Webhook is still preferred for reliability.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    wallet?: string;
  };
  const sessionId = body.sessionId?.trim() || "";
  const wallet = body.wallet?.trim() || "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json({
        ok: false,
        paid: false,
        status: session.payment_status,
      });
    }

    const metaWallet = session.metadata?.wallet || session.client_reference_id || "";
    if (metaWallet !== wallet) {
      return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
    }
    if (session.metadata?.product !== "credits_pack_aud_5") {
      return NextResponse.json({ error: "Not a credits session" }, { status: 400 });
    }

    const delta = Number(
      session.metadata?.credit_cents || session.amount_total || CREDIT_PACK_CREDITS,
    );

    await initDb();
    const { balanceCents, applied } = await creditWalletFromStripe({
      wallet,
      deltaCents: delta,
      stripeSessionId: session.id,
      note: "A$5 credits pack (client confirm)",
    });

    return NextResponse.json({
      ok: true,
      paid: true,
      applied,
      balanceCents,
      balanceCredits: balanceCents,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "confirm failed";
    console.error("[credits/confirm]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  if (!wallet) {
    return NextResponse.json({ balanceCents: 0 });
  }
  try {
    new PublicKey(wallet);
    await initDb();
    const balanceCents = await getCreditBalanceCents(wallet);
    return NextResponse.json({ balanceCents, balanceCredits: balanceCents });
  } catch {
    return NextResponse.json({ balanceCents: 0 });
  }
}
