import { NextRequest, NextResponse } from "next/server";
import { notifyEvent } from "@/lib/notify";
import { verifyWebhookSignature } from "@/lib/moonpay";

export const dynamic = "force-dynamic";

type MoonPayWebhook = {
  type?: string;
  data?: {
    id?: string;
    status?: string;
    walletAddress?: string;
    baseCurrencyAmount?: number;
    quoteCurrencyAmount?: number;
    currency?: { code?: string };
    failureReason?: string | null;
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("moonpay-signature-v2");

  if (!verifyWebhookSignature(signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: MoonPayWebhook;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tx = event.data;
  if (event.type === "transaction_updated" && tx?.status === "completed") {
    notifyEvent({
      kind: "onramp_completed",
      title: "MoonPay purchase completed",
      fields: {
        address: tx.walletAddress,
        usd: tx.baseCurrencyAmount,
        received: tx.quoteCurrencyAmount,
        currency: tx.currency?.code,
        txId: tx.id,
      },
    });
  } else if (event.type === "transaction_updated" && tx?.status === "failed") {
    notifyEvent({
      kind: "onramp_failed",
      title: "MoonPay purchase failed",
      fields: { address: tx.walletAddress, reason: tx.failureReason ?? "unknown", txId: tx.id },
    });
  }

  return NextResponse.json({ received: true });
}
