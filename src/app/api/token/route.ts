import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { initDb, saveToken, getWalletTokens } from "@/lib/db";
import { notifyTokenLaunch, notifyEvent } from "@/lib/notify";

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
    if (data.network && data.network !== "mainnet" && data.network !== "devnet") {
      return NextResponse.json({ error: "Invalid network" }, { status: 400 });
    }

    const id = await saveToken(data);

    // Keep notifications running after the response is sent. Without after(),
    // the Vercel function terminates as soon as we return — the Telegram
    // fetches were getting killed mid-flight (see runtime logs: we'd see
    // '[notify] Sending...' but never the success/error tail).
    after(async () => {
      try {
        await notifyTokenLaunch({
          name: data.name,
          symbol: data.symbol,
          description: data.description,
          imageUrl: data.imageUrl,
          mintAddress: data.mintAddress,
          network: data.network,
        });
      } catch (err) {
        console.error('[api/token] Notification failed:', err);
        await notifyEvent({
          kind: 'token_launch_notify_error',
          emoji: '⚠️',
          title: 'Public-channel notify failed',
          fields: { mint: data.mintAddress, error: String(err) },
        });
      }
      await notifyEvent({
        kind: 'token_launch',
        emoji: data.network === 'devnet' ? '🟡' : '🟢',
        title: `Token launched (${data.network === 'devnet' ? 'test' : 'live'})`,
        fields: {
          name: data.name,
          symbol: data.symbol,
          mint: data.mintAddress,
          wallet: data.wallet,
          network: data.network,
          ip,
        },
      });
    });

    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e) {
    notifyEvent({
      kind: 'token_launch_error',
      emoji: '⚠️',
      title: 'Token save failed',
      fields: { ip, error: String(e) },
    });
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
