import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  createTokenCheckoutOrder,
  crossmintConfigured,
  crossmintBaseUrl,
  defaultTokenMint,
  type CrossmintNetwork,
} from "@/lib/crossmint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const networkParam = req.nextUrl.searchParams.get("network");
  const network: CrossmintNetwork =
    networkParam === "devnet" ? "devnet" : "mainnet";
  const configured = await crossmintConfigured(network);
  const anyConfigured = await crossmintConfigured();
  return NextResponse.json(
    {
      ok: anyConfigured,
      configured: anyConfigured,
      networkConfigured: configured,
      mode: "token-checkout",
      onramp: false,
      env: network === "devnet" ? "staging" : "production",
      base: crossmintBaseUrl(network),
      defaultMint: defaultTokenMint(network),
      amountsUsd: [5, 10, 25, 50, 100],
      applePay: true,
      hasClientKey: Boolean(
        process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ||
          process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY_STAGING ||
          process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY_PRODUCTION ||
          process.env.NEXT_PUBLIC_CROSSMINT_API_KEY,
      ),
      label: "Token checkout · Apple Pay",
      note: "FOMO-style token checkout only. No USDC onramp.",
    },
    { headers: noStore },
  );
}

/**
 * POST Token Checkout
 * { wallet, amountUsd, tokenMint?, network?, email? }
 * tokenMint required on mainnet; devnet defaults to XMEME test token.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    amountUsd?: string | number;
    tokenMint?: string;
    mint?: string;
    asset?: string; // legacy — ignored except reject USDC
    network?: string;
    email?: string;
  };

  const network: CrossmintNetwork =
    body.network === "devnet" ? "devnet" : "mainnet";

  if (!(await crossmintConfigured(network))) {
    return NextResponse.json(
      {
        error:
          network === "devnet"
            ? "Crossmint staging not configured (sk_staging_…)."
            : "Crossmint production not configured (sk_production_…).",
      },
      { status: 503 },
    );
  }

  // Explicitly reject onramp assets
  const asset = (body.asset || "").toUpperCase();
  if (asset === "USDC" || asset === "SOL" || asset === "USDT") {
    return NextResponse.json(
      {
        error:
          "Onramp removed. Use Token Checkout with a token mint (memecoin / app token), not USDC/SOL.",
      },
      { status: 400 },
    );
  }

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const mint =
    body.tokenMint?.trim() ||
    body.mint?.trim() ||
    defaultTokenMint(network) ||
    "";
  if (!mint) {
    return NextResponse.json(
      {
        error:
          "tokenMint required on mainnet (Solana mint address for Token Checkout).",
      },
      { status: 400 },
    );
  }

  const amountUsd = String(body.amountUsd ?? "10");

  try {
    const order = await createTokenCheckoutOrder({
      wallet,
      amountUsd,
      tokenMint: mint,
      network,
      receiptEmail: body.email?.trim(),
    });
    return NextResponse.json({
      ok: true,
      mode: "token-checkout",
      orderId: order.orderId,
      clientSecret: order.clientSecret,
      phase: order.phase,
      paymentStatus: order.paymentStatus,
      amountUsd: parseFloat(amountUsd),
      deliveryWallet: order.deliveryWallet,
      tokenLocator: order.tokenLocator,
      network: order.network,
      embedBaseUrl: order.embedBaseUrl,
      hostedCheckoutUrl: order.clientSecret
        ? `${order.embedBaseUrl}/sdk/2024-03-05/embedded-checkout?orderId=${encodeURIComponent(order.orderId)}&clientSecret=${encodeURIComponent(order.clientSecret)}`
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Crossmint failed";
    console.error("[crossmint/order]", msg);
    let out = msg;
    if (/onramp/i.test(msg)) {
      out =
        "This mint routes to Onramp (disabled). Pick a Token Checkout–supported mint.";
    }
    return NextResponse.json({ error: out }, { status: 502 });
  }
}
