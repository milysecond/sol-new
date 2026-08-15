import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { initDb, saveWallet } from "@/lib/db";
import { notifyEvent, requestIp } from "@/lib/notify";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { publicKey, credentialId } = (await req.json()) as {
      publicKey?: string;
      credentialId?: string;
    };
    if (!publicKey || typeof publicKey !== "string" || publicKey.length > 64) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    const { created } = await saveWallet(publicKey, credentialId);

    // Log every register attempt with geo (new + reconnect)
    const ua = req.headers.get("user-agent") || "";
    after(async () => {
      await notifyEvent(
        {
          kind: created ? "wallet_new" : "wallet_seen",
          emoji: created ? "🆕" : "👋",
          title: created ? "New wallet created" : "Wallet connected",
          fields: {
            wallet: publicKey,
            credentialId,
            ua: ua.slice(0, 120),
          },
        },
        { req },
      );
    });
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    void notifyEvent(
      {
        kind: "wallet_register_error",
        emoji: "⚠️",
        title: "Wallet register failed",
        fields: { error: String(e) },
      },
      { req },
    );
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
