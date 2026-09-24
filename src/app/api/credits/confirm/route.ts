import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  CREDIT_PACK_CREDITS,
  retrieveCheckoutSession,
  creditsConfigured,
} from "@/lib/credits";
import { creditWalletFromStripe, getCreditBalanceCents, initDb } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { sessionId, wallet }
 * Client fallback when returning from Checkout — credits if paid (idempotent).
 * Retries friendly when Stripe still settling.
 */
export async function POST(req: NextRequest) {
  if (!creditsConfigured()) {
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
    const session = await retrieveCheckoutSession(sessionId);
    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";

    if (!paid) {
      return NextResponse.json({
        ok: false,
        paid: false,
        status: session.payment_status,
        retry: true,
      });
    }

    const metaWallet = (
      session.metadata?.wallet ||
      session.client_reference_id ||
      ""
    ).trim();
    if (metaWallet && metaWallet !== wallet) {
      console.error("[credits/confirm] wallet mismatch", {
        metaWallet: metaWallet.slice(0, 8),
        wallet: wallet.slice(0, 8),
      });
      return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
    }

    const product = session.metadata?.product || "";
    if (product && product !== "credits_pack_aud_5") {
      return NextResponse.json({ error: "Not a credits session" }, { status: 400 });
    }

    const delta = Number(
      session.metadata?.credit_cents ||
        session.metadata?.credits ||
        session.amount_total ||
        CREDIT_PACK_CREDITS,
    );

    await initDb();
    const { balanceCents, applied } = await creditWalletFromStripe({
      wallet: metaWallet || wallet,
      deltaCents: delta > 0 ? Math.floor(delta) : CREDIT_PACK_CREDITS,
      stripeSessionId: session.id,
      note: "A$5 credits pack (client confirm)",
    });

    if (applied) {
      notifyEvent({
        kind: "credits_purchase",
        title: "Credits purchased (confirm)",
        fields: {
          wallet: metaWallet || wallet,
          sessionId: session.id,
          credits: String(delta),
          balance: String(balanceCents),
        },
      }).catch(() => {});
    }

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
  } catch (e) {
    console.error("[credits/confirm GET]", e);
    return NextResponse.json({ balanceCents: 0, error: "balance_failed" });
  }
}
