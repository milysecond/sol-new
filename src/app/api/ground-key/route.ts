import { NextRequest, NextResponse } from "next/server";
import { markGroundKeyUsed, initDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { notifyEvent } from "@/lib/notify";

/**
 * Ground vanity keypairs live in Turso and must never be returned to anonymous
 * clients. Server launch routes claim them in-process via claimGroundKey().
 *
 * Public GET is disabled: secrets are not served over the open internet.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Ground key claim is not available publicly. Mint keypairs are assigned server-side during launch.",
    },
    { status: 403 }
  );
}

// POST: mark a key as used by a wallet (internal API key required)
export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    await initDb();
    const { publicKey, wallet } = (await req.json()) as { publicKey?: string; wallet?: string };
    if (!publicKey || !wallet) {
      return NextResponse.json({ ok: false, error: "Missing publicKey or wallet" }, { status: 400 });
    }
    if (typeof publicKey !== "string" || publicKey.length > 64 || typeof wallet !== "string" || wallet.length > 64) {
      return NextResponse.json({ ok: false, error: "Invalid publicKey or wallet" }, { status: 400 });
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
