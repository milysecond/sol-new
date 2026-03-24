import { NextRequest, NextResponse } from "next/server";
import { claimGroundKey, markGroundKeyUsed, initDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET: claim a pre-ground "NEW" keypair (AUTH REQUIRED)
export async function GET(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    await initDb();
    const key = await claimGroundKey("NEW");
    if (!key) {
      return NextResponse.json({ ok: false, error: "No pre-ground keys available" }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      publicKey: key.publicKey,
      secretKey: key.secretKey,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// POST: mark a key as used by a wallet (AUTH REQUIRED)
export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const { publicKey, wallet } = await req.json();
    if (!publicKey || !wallet) {
      return NextResponse.json({ ok: false, error: "Missing publicKey or wallet" }, { status: 400 });
    }
    await markGroundKeyUsed(publicKey, wallet);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
