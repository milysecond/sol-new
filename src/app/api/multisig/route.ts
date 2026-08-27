import { NextRequest, NextResponse } from "next/server";
import { initDb, saveMultisig, getWalletMultisigs } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

// Rate limit
const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 5;
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
    const data = (await req.json()) as {
      wallet: string;
      name: string;
      multisigPda: string;
      vault: string;
      threshold: number;
      memberCount: number;
      network?: string;
    };
    if (!data.wallet || !data.name || !data.multisigPda || !data.vault) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (typeof data.wallet !== "string" || data.wallet.length > 64) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    if (data.network && data.network !== "mainnet" && data.network !== "devnet") {
      return NextResponse.json({ error: "Invalid network" }, { status: 400 });
    }
    const id = await saveMultisig(data);
    notifyEvent({
      kind: 'multisig_create',
      emoji: '👥',
      title: 'Multisig created',
      fields: {
        name: data.name,
        wallet: data.wallet,
        multisigPda: data.multisigPda,
        vault: data.vault,
        ip,
      },
    }, { req });
    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e) {
    notifyEvent({
      kind: 'multisig_create_error',
      emoji: '⚠️',
      title: 'Multisig save failed',
      fields: { ip, error: String(e) },
    }, { req });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    const result = await getWalletMultisigs(wallet);
    return NextResponse.json({ multisigs: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
