import { NextRequest, NextResponse } from "next/server";
import { initDb, saveToken, getWalletTokens } from "@/lib/db";
import { notifyTokenLaunch } from "@/lib/notify";

// Rate limit: simple in-memory tracker
const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 5; // max per minute
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
    const data = await req.json();
    if (!data.wallet || !data.name || !data.symbol) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    // Input validation
    if (typeof data.wallet !== "string" || data.wallet.length > 64) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    if (typeof data.name !== "string" || data.name.length > 100) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof data.symbol !== "string" || data.symbol.length > 20) {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const id = await saveToken(data);

    notifyTokenLaunch({
      name: data.name,
      symbol: data.symbol,
      description: data.description,
      imageUrl: data.imageUrl,
      mintAddress: data.mintAddress,
    }).catch((err) => {
      console.error('[api/token] Notification failed:', err);
    });

    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    const result = await getWalletTokens(wallet);
    return NextResponse.json({ tokens: result.rows }, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
