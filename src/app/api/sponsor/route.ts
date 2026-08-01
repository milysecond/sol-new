import { NextRequest, NextResponse } from "next/server";
import {
  feePayerConfigured,
  feePayerPubkey,
  sponsorAndSend,
} from "@/lib/fee-payer";

export const dynamic = "force-dynamic";

const recentIPs = new Map<string, number[]>();
const RATE = 40;
const WINDOW = 60_000;

function limited(ip: string) {
  const now = Date.now();
  const ts = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW);
  if (ts.length >= RATE) return true;
  ts.push(now);
  recentIPs.set(ip, ts);
  return false;
}

/** GET — is sponsorship on + fee payer pubkey */
export async function GET() {
  if (!feePayerConfigured()) {
    return NextResponse.json({ ok: false, configured: false });
  }
  try {
    return NextResponse.json({
      ok: true,
      configured: true,
      feePayer: feePayerPubkey(),
      note: "sol.new pays network fees when feePayer is set on the tx",
    });
  } catch {
    return NextResponse.json({ ok: false, configured: false });
  }
}

/**
 * POST { transaction: base64, network?: "mainnet"|"devnet" }
 * Co-sign + send a tx that already has feePayer = sol.new and other signers.
 */
export async function POST(req: NextRequest) {
  if (!feePayerConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Sponsorship unavailable" },
      { status: 503 }
    );
  }
  const ip =
    req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "x";
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = (await req.json()) as {
      transaction?: string;
      network?: string;
    };
    if (!body.transaction || typeof body.transaction !== "string") {
      return NextResponse.json({ error: "Missing transaction" }, { status: 400 });
    }
    if (body.transaction.length > 20_000) {
      return NextResponse.json({ error: "Transaction too large" }, { status: 400 });
    }

    const result = await sponsorAndSend({
      transactionBase64: body.transaction,
      network: body.network,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
