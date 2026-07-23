import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { validatePromoCode, redeemPromoCode, initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// SOL to send per launch kind — covers all on-chain costs (rent + tx fees)
const FUND_AMOUNTS: Record<string, number> = {
  token_launch: 0.045,
  nft_standard: 0.025,
  nft_compressed: 0.003,
  multisig: 0.055,
};

// Per-isolate rate limit (defense in depth; promo redeem is the real control)
const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 5;
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { code, wallet, kind, quantity = 1 } = (await req.json().catch(() => ({}))) as {
    code?: string;
    wallet?: string;
    kind?: string;
    quantity?: number;
  };

  if (!code || !wallet || !kind) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  const perUnit = FUND_AMOUNTS[kind];
  if (!perUnit) {
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }
  // Cap qty tightly: each unit burns one promo use
  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
  const amount = perUnit * qty;

  const TREASURY_KEY = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!TREASURY_KEY) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  await initDb();

  const promo = await validatePromoCode(code);
  if (!promo.valid) {
    return NextResponse.json({ error: "Invalid or expired promo code" }, { status: 400 });
  }
  if (promo.usesRemaining < qty) {
    return NextResponse.json(
      { error: `Not enough uses remaining (need ${qty}, have ${promo.usesRemaining})` },
      { status: 400 }
    );
  }

  // Consume uses FIRST so the same code cannot drain the treasury.
  // If the on-chain transfer fails after this, the code is still spent —
  // preferred over unlimited free SOL.
  const redeemed = await redeemPromoCode(code, userPubkey.toBase58(), kind, qty);
  if (!redeemed) {
    return NextResponse.json({ error: "Invalid or exhausted promo code" }, { status: 409 });
  }

  try {
    const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const connection = new Connection(RPC, "confirmed");

    const bs58 = (await import("bs58")).default;
    const treasury = Keypair.fromSecretKey(bs58.decode(TREASURY_KEY));

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: treasury.publicKey });
    tx.add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: userPubkey,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
      commitment: "confirmed",
    });

    return NextResponse.json({ ok: true, signature, amount, qty });
  } catch (e) {
    console.error("[promo/fund] transfer failed after redeem", e);
    return NextResponse.json(
      {
        error:
          "Promo was redeemed but funding transfer failed. Contact support with your wallet and code.",
        redeemed: true,
      },
      { status: 502 }
    );
  }
}
