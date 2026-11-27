import { NextRequest, NextResponse } from "next/server";
import {
  feePayerConfigured,
  feePayerPubkey,
  sponsorAndSend,
  SponsorRejected,
} from "@/lib/fee-payer";
import { clientIpFrom } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
 * Only allowlisted shapes (gift sweep / token-account close) are signed, with
 * durable per-IP / per-wallet / global limits — see sponsorAndSend (audit C2).
 */
export async function POST(req: NextRequest) {
  if (!feePayerConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Sponsorship unavailable" },
      { status: 503 }
    );
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
      clientIp: clientIpFrom(req.headers),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof SponsorRejected ? e.status : 400;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status }
    );
  }
}
