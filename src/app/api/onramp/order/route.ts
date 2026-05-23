import { NextRequest, NextResponse } from "next/server";
import { notifyEvent } from "@/lib/notify";
import { USDC_MAINNET_MINT } from "@/lib/usdc";

const API_KEY = process.env.CROSSMINT_API_KEY!;
const PROJECT_ID = process.env.CROSSMINT_PROJECT_ID;

function crossmintBase() {
  // Detect staging vs production from the key prefix
  return API_KEY?.startsWith("sk_staging_")
    ? "https://staging.crossmint.com"
    : "https://www.crossmint.com";
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: "CROSSMINT_API_KEY not configured" }, { status: 500 });
    }

    const { address, amount, email } = await req.json();
    if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const usd = String(Math.max(20, Math.min(150, Number(amount) || 25)));

    // Build order: pay with fiat (Apple Pay surfaces inside Crossmint's
    // hosted checkout when the device + verified domain support it), receive
    // USDC on Solana delivered to the user's wallet.
    const orderBody = {
      recipient: { walletAddress: address },
      payment: {
        method: "checkoutcom-apple-pay",
        receiptEmail: email || undefined,
      },
      lineItems: [
        {
          tokenLocator: `solana:${USDC_MAINNET_MINT}`,
          executionParameters: {
            mode: "exact-in",
            amount: usd,
            currency: "usd",
          },
        },
      ],
      metadata: { source: "sol.new", projectId: PROJECT_ID },
    };

    const res = await fetch(`${crossmintBase()}/api/2022-06-09/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(orderBody),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Crossmint order error:", res.status, data);
      return NextResponse.json(
        { error: data?.message || data?.error || JSON.stringify(data) },
        { status: res.status },
      );
    }

    // The shape varies between Crossmint API versions. Try a couple known
    // paths to find the hosted-checkout URL.
    const order = data.order ?? data;
    const hostedUrl =
      order?.payment?.preparation?.checkoutUrl ??
      order?.payment?.preparation?.payinUrl ??
      data?.checkoutUrl ??
      data?.url ??
      null;
    const orderId = order?.orderId ?? order?.id ?? data?.orderId ?? null;
    const clientSecret = order?.clientSecret ?? data?.clientSecret ?? null;

    notifyEvent({
      kind: "onramp_order",
      emoji: "💳",
      title: "Crossmint order created",
      fields: { address, amount: usd, orderId },
    });

    return NextResponse.json({ ok: true, orderId, url: hostedUrl, clientSecret, raw: order });
  } catch (e) {
    console.error("Crossmint order exception:", e);
    notifyEvent({
      kind: "onramp_order_error",
      emoji: "⚠️",
      title: "Crossmint order failed",
      fields: { error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
