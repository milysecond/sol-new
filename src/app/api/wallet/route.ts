import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { initDb, saveWallet, getWalletByPublicKey } from "@/lib/db";
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
    // Only the public key is read. Older clients may still send credentialId;
    // it is ignored and never stored or logged (security audit C1).
    const { publicKey, derivation } = (await req.json()) as {
      publicKey?: string;
      derivation?: string;
    };
    if (!publicKey || typeof publicKey !== "string" || publicKey.length > 64) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    // Derivation mode (audit H1). Informational only: the client never trusts
    // this value to pick a seed.
    const mode =
      derivation === "prf-v1" || derivation === "rawid-legacy" ? derivation : null;
    const { created } = await saveWallet(publicKey, mode);

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
            ...(mode ? { mode } : {}),
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

/**
 * GET /api/wallet?pk=<a>&pk=<b> → { found: { [pk]: boolean } }
 * Lets a browser that returned no PRF result check whether a legacy
 * (rawId-derived) address is a known sol.new wallet before using it (audit H1).
 * Public keys only; reveals nothing beyond "this address has used sol.new".
 */
export async function GET(req: NextRequest) {
  const ip = requestIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const pks = req.nextUrl.searchParams
    .getAll("pk")
    .filter((p) => typeof p === "string" && p.length >= 32 && p.length <= 64)
    .slice(0, 2);
  if (!pks.length) {
    return NextResponse.json({ error: "Invalid pk" }, { status: 400 });
  }
  try {
    await initDb();
    const found: Record<string, boolean> = {};
    for (const pk of pks) found[pk] = !!(await getWalletByPublicKey(pk));
    return NextResponse.json({ found }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
