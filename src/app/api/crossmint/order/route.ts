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
  const configured = await crossmintConfigured();
  const staging = configured ? await isCrossmintStaging() : false;
  return NextResponse.json(
    {
      ok: configured,
      configured,
      env: staging ? "staging" : "production",
      base: configured ? await crossmintBaseUrl() : null,
      assets: ["USDC", "SOL"],
      amountsUsd: [5, 10, 25, 50, 100],
      label: "Buy crypto with card / Apple Pay → wallet",
    },
    { headers: noStore },
  );
}

export async function POST(req: NextRequest) {
  if (!(await crossmintConfigured())) {
    return NextResponse.json(
      { error: "Crossmint not configured. Set CROSSMINT_API_KEY Worker secret." },
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
    const base = await crossmintBaseUrl();
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
      payUrl:
        order.checkoutUrl ||
        `${base}/checkout?orderId=${encodeURIComponent(order.orderId)}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Crossmint failed";
    console.error("[crossmint/order]", msg);
    // Friendlier copy for the two known blockers
    let out = msg;
    if (/onramp is not yet enabled/i.test(msg)) {
      out =
        "Crossmint production onramp isn’t enabled on this project yet. Test with a staging key (sk_staging_…) or ask Crossmint to enable production onramp (crossmint.com/contact/sales). Meanwhile add NEXT_PUBLIC_CROSSMINT_CLIENT_KEY (ck_…) for in-browser checkout.";
    } else if (/malformed api key/i.test(msg)) {
      out =
        "Crossmint rejected the server request (often Worker IP). Use a client key (ck_production_…) via NEXT_PUBLIC_CROSSMINT_CLIENT_KEY for embedded checkout, or contact Crossmint.";
    }
    return NextResponse.json({ error: out }, { status: 502 });
  }
}
