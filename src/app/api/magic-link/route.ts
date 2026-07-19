import { NextRequest, NextResponse } from "next/server";
import {
  getWalletByPublicKey,
  getWalletEmail,
  initDb,
  upsertWalletEmail,
} from "@/lib/db";
import {
  isValidWalletPubkey,
  magicLinkConfigured,
  sendMagicLinkEmail,
  verifyMagicLink,
  type MagicLinkPurpose,
} from "@/lib/magic-link";
import { parseEmail, resendConfigured } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 6;
const WINDOW_MS = 60 * 60 * 1000;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

/** GET — verify a magic token (does not consume it). */
export async function GET(request: NextRequest) {
  if (!magicLinkConfigured()) {
    return NextResponse.json(
      { error: "Magic links not configured" },
      { status: 503 }
    );
  }
  const token =
    request.nextUrl.searchParams.get("t") ||
    request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const claims = await verifyMagicLink(token);
  if (!claims) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    email: claims.email,
    wallet: claims.wallet,
    credentialId: claims.credentialId || null,
    purpose: claims.purpose,
  });
}

/**
 * POST — send a magic link email tied to a passkey wallet.
 * Body: { email, wallet?, credentialId?, purpose?: 'link'|'open' }
 * If wallet omitted, looks up a previously linked wallet for that email.
 */
export async function POST(request: NextRequest) {
  if (!resendConfigured() || !magicLinkConfigured()) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  let body: {
    email?: string;
    wallet?: string;
    credentialId?: string;
    purpose?: MagicLinkPurpose;
    website?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.website && String(body.website).trim()) {
    return NextResponse.json({ ok: true });
  }

  const email = parseEmail(body.email ?? null);
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  await initDb();

  let wallet =
    typeof body.wallet === "string" && isValidWalletPubkey(body.wallet)
      ? body.wallet
      : null;
  let credentialId =
    typeof body.credentialId === "string" && body.credentialId.length < 512
      ? body.credentialId
      : undefined;

  const purpose: MagicLinkPurpose =
    body.purpose === "open" ? "open" : wallet ? "link" : "open";

  if (!wallet) {
    const linked = await getWalletEmail(email);
    if (!linked?.wallet) {
      return NextResponse.json(
        {
          error:
            "No wallet linked to this email yet. Connect your passkey wallet and request a link from the site.",
        },
        { status: 404 }
      );
    }
    wallet = linked.wallet;
    credentialId = linked.credentialId || credentialId;
  }

  if (!credentialId) {
    const row = await getWalletByPublicKey(wallet);
    if (row?.credentialId) credentialId = row.credentialId;
  }

  // Pending association until passkey proof on /magic
  await upsertWalletEmail({
    email,
    wallet,
    credentialId,
    verified: false,
  });

  try {
    await sendMagicLinkEmail({
      email,
      wallet,
      credentialId,
      purpose,
    });
  } catch (e) {
    console.error("[magic-link] send", e);
    return NextResponse.json(
      { error: "Couldn’t send the magic link. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    wallet,
    purpose,
    message: "Check your inbox for a magic link to open this wallet.",
  });
}
