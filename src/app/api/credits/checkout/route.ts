import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  CREDIT_PACK_AUD_CENTS,
  CREDIT_PACK_CREDITS,
  CREDIT_CURRENCY,
  createCreditsCheckoutSession,
  creditsConfigured,
} from "@/lib/credits";
import { getCreditBalanceCents, initDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET ?wallet= — balance + pack info */
export async function GET(req: NextRequest) {
  const configured = creditsConfigured();
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  let balanceCents = 0;
  if (configured && wallet) {
    try {
      new PublicKey(wallet);
      await initDb();
      balanceCents = await getCreditBalanceCents(wallet);
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json(
    {
      ok: configured,
      configured,
      currency: CREDIT_CURRENCY,
      packAudCents: CREDIT_PACK_AUD_CENTS,
      packCredits: CREDIT_PACK_CREDITS,
      balanceCents,
      balanceCredits: balanceCents, // 1:1 with cents for now
      label: "A$5 → 500 credits",
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, email? }
 * Creates Stripe Checkout (Apple Pay / card) for A$5 credits pack.
 */
export async function POST(req: NextRequest) {
  if (!creditsConfigured()) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    email?: string;
  };
  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    (req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : "https://sol.new");

  try {
    const { url, sessionId } = await createCreditsCheckoutSession({
      wallet,
      origin,
      customerEmail: body.email?.trim(),
    });
    return NextResponse.json({
      ok: true,
      url,
      sessionId,
      packAudCents: CREDIT_PACK_AUD_CENTS,
      packCredits: CREDIT_PACK_CREDITS,
      currency: CREDIT_CURRENCY,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[credits/checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
