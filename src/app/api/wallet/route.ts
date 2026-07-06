import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db, initDb, saveWallet } from "@/lib/db";
import { notifyEvent, geolocateIp } from "@/lib/notify";

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
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { publicKey, credentialId, walletType, passkeyPubkey } = (await req.json()) as {
      publicKey?: string;
      credentialId?: string;
      walletType?: string;
      passkeyPubkey?: string;
    };
    if (!publicKey || typeof publicKey !== "string" || publicKey.length > 64) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    const { created } = await saveWallet(publicKey, credentialId);

    // Smart wallets additionally register their P-256 passkey pubkey so
    // off-chain signatures can be verified server-side (verify-signature.ts).
    if (walletType === "smart" && typeof passkeyPubkey === "string" && passkeyPubkey.length <= 96 && credentialId) {
      await db.execute({
        sql: `INSERT INTO smart_wallets (address, passkey_pubkey, credential_id) VALUES (?, ?, ?)
              ON CONFLICT(address) DO NOTHING`,
        args: [publicKey, passkeyPubkey, credentialId],
      });
    }

    if (created) {
      const ua = req.headers.get("user-agent") || "";
      after(async () => {
        const geo = await geolocateIp(ip);
        await notifyEvent({
          kind: "wallet_new",
          emoji: "🆕",
          title: walletType === "smart" ? "New smart wallet created" : "New wallet created",
          fields: {
            wallet: publicKey,
            credentialId,
            type: walletType || "legacy",
            location: geo.line || undefined,
            ip,
            ua: ua.slice(0, 120),
          },
        });
      });
    }
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    notifyEvent({
      kind: "wallet_register_error",
      emoji: "⚠️",
      title: "Wallet register failed",
      fields: { ip, error: String(e) },
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
