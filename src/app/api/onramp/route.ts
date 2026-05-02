import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { notifyEvent } from "@/lib/notify";

const KEY_NAME = process.env.CDP_API_KEY_NAME!;
const KEY_SECRET = process.env.CDP_API_KEY_SECRET!;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildPrivateKey(secret: string) {
  const keyBytes = Buffer.from(secret, "base64");
  const seed = keyBytes.subarray(0, 32);
  return crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
}

function signJWT(uri: string) {
  const privateKey = buildPrivateKey(KEY_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const header = { alg: "EdDSA", kid: KEY_NAME, nonce, typ: "JWT" };
  const payload = {
    sub: KEY_NAME, iss: "cdp", aud: ["cdp_service"],
    nbf: now, exp: now + 120, iat: now, uris: [uri],
  };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const message = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign(null, Buffer.from(message), privateKey);
  return `${message}.${base64url(sig)}`;
}

// Session token endpoint (for basic onramp URL)
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const jwt = signJWT("POST api.developer.coinbase.com/onramp/v1/token");
    const res = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ addresses: [{ address, blockchains: ["solana"] }] }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: res.status });

    notifyEvent({
      kind: 'onramp_session',
      emoji: '🪪',
      title: 'Onramp session token issued',
      fields: { address },
    });

    return NextResponse.json({ ok: true, token: data.token });
  } catch (e) {
    notifyEvent({
      kind: 'onramp_session_error',
      emoji: '⚠️',
      title: 'Onramp session failed',
      fields: { error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Apple Pay order endpoint (creates order, returns iframe URL)
export async function POST(req: NextRequest) {
  try {
    const { address, email, phoneNumber, amount } = await req.json();
    if (!address || !email || !phoneNumber) {
      return NextResponse.json({ error: "Missing address, email, or phoneNumber" }, { status: 400 });
    }

    const uri = "POST api.cdp.coinbase.com/platform/v2/onramp/orders";
    const jwt = signJWT(uri);

    const now = new Date().toISOString();
    const partnerUserRef = `solnew-${Date.now()}`;

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("x-real-ip") 
      || "8.8.8.8"; // fallback for dev

    const orderBody = {
      purchaseCurrency: "SOL",
      purchaseNetwork: "solana",
      destinationNetwork: "solana",
      paymentAmount: String(amount || "5"),
      paymentCurrency: "USD",
      paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
      destinationAddress: address,
      email,
      phoneNumber,
      phoneNumberVerifiedAt: now,
      agreementAcceptedAt: now,
      partnerUserRef,
      isQuote: false,
      clientIp: clientIp.startsWith("192.") || clientIp.startsWith("10.") || clientIp === "127.0.0.1" ? "8.8.8.8" : clientIp,
    };

    console.log("Creating Apple Pay order:", { ...orderBody, email: "***" });

    const res = await fetch("https://api.cdp.coinbase.com/platform/v2/onramp/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(orderBody),
    });

    const data = await res.json();
    console.log("CDP response:", res.status, JSON.stringify(data).slice(0, 500));

    if (!res.ok) {
      return NextResponse.json({ error: data.message || data.error || JSON.stringify(data) }, { status: res.status });
    }

    notifyEvent({
      kind: 'onramp_order',
      emoji: '💳',
      title: 'Coinbase onramp order',
      fields: {
        amount: orderBody.paymentAmount,
        currency: orderBody.paymentCurrency,
        destination: address,
        orderId: data.orderId,
        partnerUserRef,
      },
    });

    return NextResponse.json({
      ok: true,
      url: data.paymentLinkUrl,
      orderId: data.orderId,
    });
  } catch (e) {
    console.error("Onramp order error:", e);
    notifyEvent({
      kind: 'onramp_order_error',
      emoji: '⚠️',
      title: 'Coinbase onramp order failed',
      fields: { error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
