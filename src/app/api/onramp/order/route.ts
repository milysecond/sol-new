import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { notifyEvent } from "@/lib/notify";

const BANXA_API_KEY = process.env.BANXA_API_KEY ?? "";
const BANXA_API_SECRET = process.env.BANXA_API_SECRET ?? "";
const BANXA_SANDBOX = process.env.BANXA_SANDBOX !== "0"; // default sandbox=true until explicitly disabled
const BANXA_BASE = BANXA_SANDBOX
  ? "https://itez.banxa-sandbox.com"
  : "https://itez.banxa.com";

function banxaAuth(method: string, path: string, body: string): string {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
  const signature = crypto
    .createHmac("sha256", BANXA_API_SECRET)
    .update(payload)
    .digest("hex");
  return `Token ${BANXA_API_KEY}:${nonce}:${timestamp}:${signature}`;
}

export async function POST(req: NextRequest) {
  try {
    const { address, amount } = await req.json() as { address?: string; amount?: number };
    if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const fiatAmount = String(Math.max(20, Math.min(500, Number(amount) || 50)));
    const returnUrl = `${req.headers.get("origin") ?? "https://sol.new"}/get?onramp=done`;

    const body = JSON.stringify({
      account_reference: address,
      source: "USD",
      source_amount: fiatAmount,
      target: "SOL",
      wallet_address: address,
      blockchain: "SOLANA",
      return_url_on_success: returnUrl,
      return_url_on_failure: `${req.headers.get("origin") ?? "https://sol.new"}/get?onramp=failed`,
    });

    const path = "/api/orders";
    const res = await fetch(`${BANXA_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: banxaAuth("POST", path, body),
      },
      body,
    });

    const data = await res.json() as { data?: { order?: { id?: string; checkout_url?: string } }; errors?: unknown };
    if (!res.ok) {
      console.error("Banxa order error:", res.status, data);
      return NextResponse.json({ error: JSON.stringify(data?.errors ?? data) }, { status: res.status });
    }

    const order = data?.data?.order;
    const url = order?.checkout_url ?? null;
    const orderId = order?.id ?? null;

    notifyEvent({
      kind: "onramp_order",
      emoji: "💳",
      title: "Banxa order created",
      fields: { address, amount: fiatAmount, orderId: orderId ?? "?" },
    });

    return NextResponse.json({ ok: true, orderId, url });
  } catch (e) {
    console.error("Banxa order exception:", e);
    notifyEvent({
      kind: "onramp_order_error",
      emoji: "⚠️",
      title: "Banxa order failed",
      fields: { error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
