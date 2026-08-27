// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { notifyEvent } from "@/lib/notify";
import { initDb, claimGroundKey } from "@/lib/db";

import { mainnetRpcUrl } from "@/lib/rpc-server";

function heliusRpc() {
  return mainnetRpcUrl();
}

export async function POST(req: NextRequest) {
  try {
    const { name, symbol, metadataUri, creatorWallet } = await req.json();
    if (!name || !symbol || !metadataUri || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const connection = new Connection(heliusRpc(), "confirmed");
    const creator = new PublicKey(creatorWallet);

    // Dummy wallet — only needs publicKey for building instructions, no signing on server
    const dummyWallet = {
      publicKey: creator,
      signTransaction: async (tx: unknown) => tx,
      signAllTransactions: async (txs: unknown[]) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    const sdk = new PumpFunSDK(provider);

    // Use a pre-ground NEW... vanity keypair; fall back to random if pool is empty
    await initDb().catch(() => {});
    const groundKey = await claimGroundKey("NEW").catch(() => null);
    let mintKeypair: Keypair;
    if (groundKey) {
      const bs58 = (await import("bs58")).default;
      mintKeypair = Keypair.fromSecretKey(bs58.decode(groundKey.secretKey));
    } else {
      mintKeypair = Keypair.generate();
    }

    // Build the create transaction
    const tx = await sdk.getCreateInstructions(creator, name, symbol, metadataUri, mintKeypair);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = creator;
    tx.recentBlockhash = blockhash;

    // Partial-sign with mint keypair — client will add the user (creator) signature
    tx.partialSign(mintKeypair);

    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString("base64");

    notifyEvent({
      kind: "pump_launch_tx_built",
      emoji: "🚀",
      title: "Pump.fun create tx built",
      fields: { name, symbol, mint: mintKeypair.publicKey.toBase58(), creator: creatorWallet },
    }, { req });

    return NextResponse.json({
      ok: true,
      tx: serializedTx,
      mint: mintKeypair.publicKey.toBase58(),
      blockhash,
      lastValidBlockHeight,
    });
  } catch (e: unknown) {
    console.error("launch/create error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
