import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const DEVNET_RPC = "https://api.devnet.solana.com";
const AIRDROP_AMOUNT = 0.1 * LAMPORTS_PER_SOL;

function getFaucetKeypair(): Keypair {
  const key = JSON.parse(process.env.FAUCET_PRIVATE_KEY || "[]");
  return Keypair.fromSecretKey(new Uint8Array(key));
}

export async function GET() {
  const faucet = getFaucetKeypair();
  const conn = new Connection(DEVNET_RPC);
  try {
    const balance = await conn.getBalance(faucet.publicKey);
    return NextResponse.json({
      address: faucet.publicKey.toBase58(),
      balance: balance / LAMPORTS_PER_SOL,
    });
  } catch {
    return NextResponse.json({
      address: faucet.publicKey.toBase58(),
      balance: null,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

    const recipient = new PublicKey(address);
    const faucet = getFaucetKeypair();
    const conn = new Connection(DEVNET_RPC);

    const balance = await conn.getBalance(faucet.publicKey);
    if (balance < AIRDROP_AMOUNT + 5000) {
      return NextResponse.json({ error: "Faucet empty — please try again later" }, { status: 503 });
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: recipient,
        lamports: AIRDROP_AMOUNT,
      })
    );

    const sig = await conn.sendTransaction(tx, [faucet]);
    await conn.confirmTransaction(sig);

    return NextResponse.json({ ok: true, signature: sig, amount: 0.1 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
