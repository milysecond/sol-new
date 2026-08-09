import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  buildMoonpayBuyUrl,
  moonpayConfigured,
  moonpayIsTest,
} from "@/lib/moonpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET — is MoonPay ready? */
export async function GET() {
  return NextResponse.json(
    {
      ok: moonpayConfigured(),
      configured: moonpayConfigured(),
      testMode: moonpayConfigured() ? moonpayIsTest() : null,
      supportsAustralia: true,
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, asset?: "SOL"|"USDC", fiatAmount?, fiatCurrency? }
 * Returns signed MoonPay buy URL (AUD + Apple Pay friendly).
 */
export async function POST(req: NextRequest) {
  if (!moonpayConfigured()) {
    return NextResponse.json({ error: "MoonPay not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    asset?: string;
    fiatAmount?: number | string;
    fiatCurrency?: string;
    email?: string;
  };

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const asset = body.asset?.toUpperCase() === "USDC" ? "USDC" : "SOL";
  let fiatAmount: number | undefined;
  if (body.fiatAmount != null && body.fiatAmount !== "") {
    const n = Number(body.fiatAmount);
    if (!Number.isFinite(n) || n < 5 || n > 50_000) {
      return NextResponse.json({ error: "Amount must be between 5 and 50000" }, { status: 400 });
    }
    fiatAmount = n;
  }

  const origin =
    req.headers.get("origin") ||
    (req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : "https://sol.new");

  try {
    const { url, testMode } = buildMoonpayBuyUrl({
      wallet,
      asset,
      fiatAmount,
      fiatCurrency: body.fiatCurrency?.trim().toUpperCase() || "AUD",
      redirectURL: `${origin}/get?moonpay=done`,
      email: body.email?.trim(),
    });

    return NextResponse.json({
      ok: true,
      widgetUrl: url,
      provider: "moonpay",
      testMode,
      asset,
      wallet,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create MoonPay URL";
    console.error("[moonpay/widget]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
