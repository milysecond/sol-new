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
      assets: staging ? ["USDC", "XMEME"] : ["USDC"],
      amountsUsd: [5, 10, 25, 50, 100],
      label: "Buy crypto with card / Apple Pay → wallet",
      note: staging
        ? "Staging: USDC → Crossmint smart wallet (your passkey is admin). XMEME can go direct."
        : "Production onramp may require Crossmint enablement.",
    },
    { headers: noStore },
  );
}

export async function POST(req: NextRequest) {
  if (!(await crossmintConfigured())) {
    return NextResponse.json(
      { error: "Crossmint not configured. Set CROSSMINT_API_KEY." },
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

  const assetRaw = (body.asset || "USDC").toUpperCase();
  const asset = (
    assetRaw === "XMEME" ? "XMEME" : assetRaw === "SOL" ? "SOL" : "USDC"
  ) as CrossmintAsset;
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
      phase: order.phase,
      paymentStatus: order.paymentStatus,
      asset,
      amountUsd: parseFloat(amountUsd),
      deliveryWallet: order.deliveryWallet,
      adminWallet: order.adminWallet,
      usedSmartWallet: order.usedSmartWallet,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Crossmint failed";
    console.error("[crossmint/order]", msg);
    let out = msg;
    if (/onramp is not yet enabled/i.test(msg)) {
      out =
        "Production onramp not enabled. Use staging keys or contact Crossmint sales.";
    } else if (/malformed api key/i.test(msg)) {
      out =
        "Crossmint rejected the server key from this network. Prefer embedded client checkout (ck_…) or staging.";
    }
    return NextResponse.json({ error: out }, { status: 502 });
  }
}
