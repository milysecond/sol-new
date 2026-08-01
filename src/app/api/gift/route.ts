import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { initDb, saveClaimLink, getClaimLink, markClaimLinkClaimed } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

function isPubkeyish(s: unknown): s is string {
  return typeof s === "string" && s.length >= 32 && s.length <= 64;
}

// Register a new gift link (called after the sender funds it on-chain).
// Only the gift wallet's *public* key is stored — never the claim secret.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { publicKey, sender, amountLamports, network, token } = (await req.json()) as {
      publicKey?: string; sender?: string; amountLamports?: number; network?: string; token?: string;
    };
    if (!isPubkeyish(publicKey) || !isPubkeyish(sender)) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    const lamports = Number(amountLamports);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const net = network === "devnet" ? "devnet" : "mainnet";
    const tok = token === "USDC" ? "USDC" : "SOL";
    await saveClaimLink({ publicKey, sender, amountLamports: lamports, network: net, token: tok });

    after(async () => {
      await notifyEvent({
        kind: "gift_created",
        emoji: "🎁",
        title: "Gift link created",
        fields: {
          sender,
          gift: publicKey,
          amount: tok === "USDC" ? `$${(lamports / 1e6).toFixed(2)} USDC` : `${(lamports / 1e9).toFixed(4)} SOL`,
          network: net,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Look up gift status by the gift wallet's public key.
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const pk = req.nextUrl.searchParams.get("pk");
    if (!isPubkeyish(pk)) {
      return NextResponse.json({ error: "Invalid pk" }, { status: 400 });
    }
    const row = await getClaimLink(pk);
    if (!row) return NextResponse.json({ found: false });
    return NextResponse.json({
      found: true,
      status: row.status,
      amountLamports: Number(row.amount_lamports),
      token: (row as { token?: string }).token || "SOL",
      network: row.network,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Mark a gift claimed (or reclaimed by the sender). Informational only —
// the sweep already happened on-chain, so no auth beyond rate limiting.
export async function PATCH(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    await initDb();
    const { publicKey, claimedBy, reclaim } = (await req.json()) as {
      publicKey?: string; claimedBy?: string; reclaim?: boolean;
    };
    if (!isPubkeyish(publicKey) || !isPubkeyish(claimedBy)) {
      return NextResponse.json({ error: "Invalid publicKey" }, { status: 400 });
    }
    const updated = await markClaimLinkClaimed(publicKey, claimedBy, reclaim ? "reclaimed" : "claimed");

    if (updated && !reclaim) {
      after(async () => {
        await notifyEvent({
          kind: "gift_claimed",
          emoji: "🥳",
          title: "Gift claimed",
          fields: { gift: publicKey, claimedBy },
        });
      });
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
