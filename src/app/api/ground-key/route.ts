import { NextRequest, NextResponse } from "next/server";
import { claimGroundKey, markGroundKeyUsed, initDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { notifyEvent } from "@/lib/notify";

// 3 claims per IP per minute — enough for any real user, prevents bulk draining
const recentClaims = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const ts = (recentClaims.get(ip) || []).filter((t) => now - t < 60_000);
  if (ts.length >= 3) return true;
  ts.push(now);
  recentClaims.set(ip, ts);
  return false;
}

// GET: claim a pre-ground "NEW" keypair (public, IP rate-limited)
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const key = await claimGroundKey("NEW");
    if (!key) {
      notifyEvent({
        kind: "ground_key_empty",
        emoji: "🚨",
        title: "No pre-ground keys available",
      });
      return NextResponse.json({ ok: false, error: "No pre-ground keys available" }, { status: 503 });
    }
    notifyEvent({
      kind: "ground_key_claim",
      emoji: "🔑",
      title: "Ground key claimed",
      fields: { publicKey: key.publicKey },
    });
    return NextResponse.json({
      ok: true,
      publicKey: key.publicKey,
      secretKey: key.secretKey,
    });
  } catch (e) {
    notifyEvent({
      kind: "ground_key_error",
      emoji: "⚠️",
      title: "Ground key claim failed",
      fields: { error: String(e) },
    });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST: mark a key as used by a wallet (AUTH REQUIRED)
export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const { publicKey, wallet } = await req.json() as { publicKey?: string; wallet?: string };
    if (!publicKey || !wallet) {
      return NextResponse.json({ ok: false, error: "Missing publicKey or wallet" }, { status: 400 });
    }
    await markGroundKeyUsed(publicKey, wallet);
    notifyEvent({
      kind: "ground_key_used",
      emoji: "✨",
      title: "New wallet bootstrapped",
      fields: { wallet, groundKey: publicKey },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    notifyEvent({
      kind: "ground_key_used_error",
      emoji: "⚠️",
      title: "Ground key mark-used failed",
      fields: { error: String(e) },
    });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
