import { NextRequest, NextResponse } from "next/server";
import {
  buildSponsoredStakeTx,
  buildSelfPaidStakeTx,
  stakeSponsorConfigured,
} from "@/lib/stake-build";
import { STAKE_VALIDATORS, MIN_STAKE_SOL } from "@/lib/stake-validators";

export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const allowedVotes = new Set(STAKE_VALIDATORS.map((v) => v.vote));

/**
 * POST /api/stake/build
 * { wallet, amountSol, vote, seed }
 * Returns fee-payer-pre-signed v0 tx (or legacy self-paid if no sponsor).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      wallet?: string;
      amountSol?: number;
      vote?: string;
      seed?: string;
    };
    const wallet = body.wallet?.trim() || "";
    const vote = body.vote?.trim() || "";
    const seed = body.seed?.trim() || "";
    const amountSol = Number(body.amountSol);

    if (!BASE58.test(wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    if (!allowedVotes.has(vote) && !BASE58.test(vote)) {
      return NextResponse.json({ error: "Invalid validator" }, { status: 400 });
    }
    if (!seed || seed.length > 32 || !/^[a-zA-Z0-9]+$/.test(seed)) {
      return NextResponse.json({ error: "Invalid seed" }, { status: 400 });
    }
    if (!Number.isFinite(amountSol) || amountSol < MIN_STAKE_SOL) {
      return NextResponse.json(
        { error: `Minimum stake is ${MIN_STAKE_SOL} SOL (Solana network rule)` },
        { status: 400 }
      );
    }
    if (amountSol > 1_000_000) {
      return NextResponse.json({ error: "Amount too large" }, { status: 400 });
    }

    if (stakeSponsorConfigured()) {
      const built = await buildSponsoredStakeTx({
        wallet,
        seed,
        amountSol,
        vote,
      });
      return NextResponse.json({ ok: true, ...built });
    }

    const built = await buildSelfPaidStakeTx({
      wallet,
      seed,
      amountSol,
      vote,
    });
    return NextResponse.json({ ok: true, sponsored: false, ...built });
  } catch (e) {
    console.error("[api/stake/build]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function GET() {
  let sponsored = false;
  let feePayer: string | null = null;
  let feePayerLamports: number | null = null;
  if (stakeSponsorConfigured()) {
    try {
      const { loadFeePayerKeypair } = await import("@/lib/fee-payer");
      const { Connection } = await import("@solana/web3.js");
      const { mainnetRpcUrl } = await import("@/lib/rpc-server");
      const kp = loadFeePayerKeypair();
      feePayer = kp.publicKey.toBase58();
      const conn = new Connection(mainnetRpcUrl(), "confirmed");
      feePayerLamports = await conn.getBalance(kp.publicKey, "confirmed");
      sponsored = feePayerLamports >= 50_000;
    } catch {
      sponsored = false;
    }
  }
  return NextResponse.json({
    ok: true,
    sponsored,
    feePayer,
    feePayerLamports,
    validators: STAKE_VALIDATORS,
  });
}
