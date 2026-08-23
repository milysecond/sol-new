import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  createCrossmintFundOrder,
  crossmintConfigured,
  crossmintBaseUrl,
  isCrossmintStaging,
  type CrossmintAsset,
} from "@/lib/crossmint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(
    {
      ok: crossmintConfigured(),
      configured: crossmintConfigured(),
      env: isCrossmintStaging() ? "staging" : "production",
      base: crossmintConfigured() ? crossmintBaseUrl() : null,
      assets: ["USDC", "SOL"],
      amountsUsd: [5, 10, 25, 50, 100],
      label: "Buy crypto with card / Apple Pay → wallet",
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, amountUsd, asset?: "USDC"|"SOL", network?: "mainnet"|"devnet", email? }
 * Creates Crossmint order — fiat in, token out to wallet (FOMO-style).
 */
export async function POST(req: NextRequest) {
  if (!crossmintConfigured()) {
    return NextResponse.json(
      {
        error:
          "Crossmint not configured. Set CROSSMINT_API_KEY (server) in Worker secrets.",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    amountUsd?: string | number;
    asset?: string;
    network?: string;
    email?: string;
  };

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const asset = (body.asset === "SOL" ? "SOL" : "USDC") as CrossmintAsset;
  const network = body.network === "devnet" ? "devnet" : "mainnet";
  const amountUsd = String(body.amountUsd ?? "10");

  try {
    const order = await createCrossmintFundOrder({
      wallet,
      amountUsd,
      asset,
      network,
      receiptEmail: body.email?.trim(),
    });
    return NextResponse.json({
      ok: true,
      orderId: order.orderId,
      clientSecret: order.clientSecret,
      stripePublishableKey: order.stripePublishableKey,
      checkoutUrl: order.checkoutUrl,
      phase: order.phase,
      paymentStatus: order.paymentStatus,
      asset,
      amountUsd: parseFloat(amountUsd),
      // Client can open Crossmint console payment page as fallback
      payUrl:
        order.checkoutUrl ||
        `${crossmintBaseUrl().replace("staging.crossmint.com", "staging.crossmint.com").replace("www.crossmint.com", "www.crossmint.com")}/checkout/pay?orderId=${encodeURIComponent(order.orderId)}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Crossmint failed";
    console.error("[crossmint/order]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
