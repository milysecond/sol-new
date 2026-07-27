// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

function heliusRpc() {
  return mainnetRpcUrl();
}

export async function POST(req: NextRequest) {
  try {
    const { name, buyerWallet } = await req.json();
    if (!name || !buyerWallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { registerDomainNameV2, USDC_MINT } = await import("@bonfida/spl-name-service");
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");

    const connection = new Connection(heliusRpc(), "confirmed");
    const buyer = new PublicKey(buyerWallet);
    const buyerTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, buyer);

    // space = 1000 bytes is a reasonable default for a domain account
    const ixs = await registerDomainNameV2(connection, name, 1000, buyer, buyerTokenAccount);

    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer;

    const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");

    return NextResponse.json({ ok: true, tx: serialized, lastValidBlockHeight });
  } catch (e) {
    console.error("id/register error", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
