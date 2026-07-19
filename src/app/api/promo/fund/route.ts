import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { validatePromoCode, initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// SOL to send per launch kind — covers all on-chain costs (rent + tx fees)
const FUND_AMOUNTS: Record<string, number> = {
  token_launch: 0.045,
  nft_standard: 0.025,
  nft_compressed: 0.003,
  multisig: 0.055,
};

export async function POST(req: NextRequest) {
  const { code, wallet, kind, quantity = 1 } = (await req.json().catch(() => ({}))) as {
    code?: string;
    wallet?: string;
    kind?: string;
    quantity?: number;
  };

  if (!code || !wallet || !kind) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const perUnit = FUND_AMOUNTS[kind];
  if (!perUnit) {
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }
  const qty = Math.max(1, Math.min(100, Number(quantity) || 1));
  const amount = perUnit * qty;

  const TREASURY_KEY = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!TREASURY_KEY) {
    return NextResponse.json({ error: "Treasury not configured" }, { status: 500 });
  }

  await initDb();
  const promo = await validatePromoCode(code);
  if (!promo) {
    return NextResponse.json({ error: "Invalid or expired promo code" }, { status: 400 });
  }

  const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const connection = new Connection(RPC, "confirmed");

  const bs58 = (await import("bs58")).default;
  const treasury = Keypair.fromSecretKey(bs58.decode(TREASURY_KEY));
  const userPubkey = new PublicKey(wallet);

  const lamports = Math.round(amount * LAMPORTS_PER_SOL);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: treasury.publicKey });
  tx.add(SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: userPubkey, lamports }));

  const signature = await sendAndConfirmTransaction(connection, tx, [treasury], { commitment: "confirmed" });

  return NextResponse.json({ ok: true, signature });
}
