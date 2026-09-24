import { NextResponse } from "next/server";
import { Keypair, Transaction } from "@solana/web3.js";
import { getGroundSecret } from "@/lib/db";
import { getStnkSecret } from "@/lib/stnk-pool";

async function mintKeypair(mint: string): Promise<Keypair | null> {
  const { default: bs58 } = await import("bs58");
  const secret = (await getStnkSecret(mint)) || (await getGroundSecret(mint));
  if (!secret) return null;
  const s = secret.trim();
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s) as number[]));
  return Keypair.fromSecretKey(bs58.decode(s));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { mint?: string; transactions?: string[] };
    const mint = body.mint || "";
    const list = Array.isArray(body.transactions) ? body.transactions : [];
    if (!mint || list.length === 0 || list.length > 8) {
      return NextResponse.json({ ok: false, error: "mint and transactions required" }, { status: 400 });
    }
    const kp = await mintKeypair(mint);
    if (!kp || kp.publicKey.toBase58() !== mint) {
      return NextResponse.json({ ok: false, error: "Unknown mint" }, { status: 404 });
    }
    const signed = list.map((b64) => {
      const tx = Transaction.from(Buffer.from(b64, "base64"));
      tx.partialSign(kp);
      return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
    });
    return NextResponse.json({ ok: true, transactions: signed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
