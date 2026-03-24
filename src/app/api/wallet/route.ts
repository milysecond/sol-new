import { NextRequest, NextResponse } from "next/server";
import { initDb, saveWallet } from "@/lib/db";

// Rate limit: simple in-memory tracker (resets on deploy)
const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 10; // max requests per minute
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { publicKey, credentialId } = await req.json();
    if (!publicKey || typeof publicKey !== "string" || publicKey.length > 64) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    await saveWallet(publicKey, credentialId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
