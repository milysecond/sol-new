import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  createCryptoOnrampSession,
  stripeConfigured,
  stripePublishableKey,
  type OnrampAsset,
} from "@/lib/stripe";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const recentIPs = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const ts = (recentIPs.get(ip) || []).filter((t) => now - t < 60_000);
  if (ts.length >= 12) return true;
  ts.push(now);
  recentIPs.set(ip, ts);
  return false;
}

function clientIp(req: NextRequest): string | undefined {
  // Prefer Cloudflare's verified client IP over spoofable X-Forwarded-For.
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || undefined;
}

/** GET — whether Stripe crypto onramp is ready (secret key is enough for hosted redirect). */
export async function GET() {
  const configured = stripeConfigured();
  const pk = stripePublishableKey();
  return NextResponse.json(
    {
      ok: configured,
      configured,
      hasSecret: configured,
      hasPublishable: Boolean(pk),
      // Publishable keys are public by design; needed only for embedded widget.
      publishableKey: pk || null,
      mode: pk ? "embed_or_redirect" : "redirect",
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, amountUsd?, asset?: "usdc" | "sol" }
 * Creates a Stripe crypto onramp session locked to the Solana wallet.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req) || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const pk = stripePublishableKey();

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    amountUsd?: number | string;
    asset?: string;
  };

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const asset: OnrampAsset = body.asset === "sol" ? "sol" : "usdc";

  let sourceAmountUsd: string | undefined;
  if (body.amountUsd != null && body.amountUsd !== "") {
    const n = Number(body.amountUsd);
    if (!Number.isFinite(n) || n < 5 || n > 10_000) {
      return NextResponse.json(
        { error: "Amount must be between $5 and $10,000 USD" },
        { status: 400 },
      );
    }
    sourceAmountUsd = n.toFixed(2);
  }

  try {
    const session = await createCryptoOnrampSession({
      wallet,
      sourceAmountUsd,
      asset,
      customerIp: ip !== "unknown" ? ip : undefined,
      metadata: {
        wallet: wallet.slice(0, 44),
        source: "sol.new/get",
      },
    });

    notifyEvent({
      kind: "stripe_onramp_session",
      title: "Stripe crypto onramp session",
      fields: {
        wallet,
        sessionId: session.id,
        asset,
        amount: sourceAmountUsd || "user_picks",
        livemode: session.livemode ? "live" : "test",
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      clientSecret: session.clientSecret,
      redirectUrl: session.redirectUrl,
      sessionId: session.id,
      status: session.status,
      livemode: session.livemode,
      publishableKey: pk || null,
      asset,
      wallet,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create onramp session";
    console.error("[stripe/onramp]", msg);
    // Surface Stripe geo / supportability errors cleanly
    const lower = msg.toLowerCase();
    const unsupportable =
      lower.includes("unsupportable") ||
      lower.includes("unsupported_country") ||
      lower.includes("unable to support");
    return NextResponse.json(
      {
        error: unsupportable
          ? "Stripe onramp is not available in your region yet (US and EU only, excluding Hawaii)."
          : msg,
        unsupportable,
      },
      { status: unsupportable ? 400 : 502 },
    );
  }
}
