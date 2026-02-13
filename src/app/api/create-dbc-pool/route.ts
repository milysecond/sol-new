// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

function getConnection(network: string) {
  if (network === "mainnet") {
    return new Connection("https://viviyan-bkj12u-fast-mainnet.helius-rpc.com", "confirmed");
  }
  return new Connection("https://api.devnet.solana.com", "confirmed");
}

function getFaucetKeypair(): Keypair {
  const secret = process.env.FAUCET_PRIVATE_KEY!;
  if (secret.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  }
  const bs58 = require("bs58");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

function getPartnerConfigKey(): PublicKey {
  const key = process.env.DBC_PARTNER_CONFIG_KEY;
  if (!key) throw new Error("DBC_PARTNER_CONFIG_KEY not set");
  return new PublicKey(key);
}

export async function POST(req: NextRequest) {
  try {
    const { name, symbol, description, metadataUri, creatorWallet, network = "devnet" } = await req.json();

    if (!name || !symbol || !metadataUri) {
      return NextResponse.json({ error: "Missing name, symbol, or metadataUri" }, { status: 400 });
    }

    const connection = getConnection(network);
    const faucet = getFaucetKeypair();
    const configKey = getPartnerConfigKey();
    const client = new DynamicBondingCurveClient(connection, "confirmed");

    // Generate fresh mint keypair
    const baseMintKeypair = Keypair.generate();

    // Create pool using existing partner config
    const tx: Transaction = await client.pool.createPool({
      config: configKey,
      baseMint: baseMintKeypair.publicKey,
      name,
      symbol,
      uri: metadataUri,
      payer: faucet.publicKey,
      poolCreator: faucet.publicKey,
    });

    // Sign and send
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.feePayer = faucet.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(faucet, baseMintKeypair);

    const txId = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature: txId, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    // Derive pool address
    const poolAddress = deriveDbcPoolAddress(WRAPPED_SOL, baseMintKeypair.publicKey, configKey);
    const mintAddress = baseMintKeypair.publicKey.toBase58();
    const poolAddr = poolAddress.toBase58();

    return NextResponse.json({
      ok: true,
      pool: poolAddr,
      config: configKey.toBase58(),
      mint: mintAddress,
      transaction: txId,
      meteoraUrl: `https://app.meteora.ag/pools/${poolAddr}`,
      solscanUrl: `https://solscan.io/token/${mintAddress}${network === "devnet" ? "?cluster=devnet" : ""}`,
    });
  } catch (e: any) {
    console.error("DBC pool creation error:", e);
    return NextResponse.json(
      { error: e?.message || String(e), details: e?.logs || undefined },
      { status: 500 }
    );
  }
}
