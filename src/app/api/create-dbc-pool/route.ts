// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { notifyEvent } from "@/lib/notify";
import { initDb, claimGroundKey } from "@/lib/db";
import { rpcUrlFor } from "@/lib/rpc-server";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");

function getConnection(network: string) {
  return new Connection(
    rpcUrlFor(network === "devnet" ? "devnet" : "mainnet"),
    "confirmed"
  );
}

function getPartnerConfigKey(): PublicKey {
  const key = process.env.DBC_PARTNER_CONFIG_KEY;
  if (!key) throw new Error("DBC_PARTNER_CONFIG_KEY not set");
  return new PublicKey(key);
}

export async function POST(req: NextRequest) {
  try {
    const { name, symbol, description, metadataUri, creatorWallet, network = "devnet", mutable = false } = await req.json();

    if (!name || !symbol || !metadataUri || !creatorWallet) {
      return NextResponse.json({ error: "Missing name, symbol, metadataUri, or creatorWallet" }, { status: 400 });
    }

    const connection = getConnection(network);
    const configKey = getPartnerConfigKey();
    const client = new DynamicBondingCurveClient(connection, "confirmed");
    const creator = new PublicKey(creatorWallet);

    // Use a pre-ground NEW... vanity keypair; fall back to random if pool is empty
    await initDb().catch(() => {});
    const groundKey = await claimGroundKey("NEW").catch(() => null);
    let baseMintKeypair: Keypair;
    if (groundKey) {
      const { default: bs58 } = await import("bs58");
      baseMintKeypair = Keypair.fromSecretKey(bs58.decode(groundKey.secretKey));
    } else {
      baseMintKeypair = Keypair.generate();
    }

    // Create pool using existing partner config
    const tx: Transaction = await client.pool.createPool({
      config: configKey,
      baseMint: baseMintKeypair.publicKey,
      name,
      symbol,
      uri: metadataUri,
      payer: creator,
      poolCreator: creator,
      updateAuthority: mutable ? creator : null,
    });

    // Get blockhash and set fee payer
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.feePayer = creator;
    tx.recentBlockhash = blockhash;
    
    // Partially sign with mint keypair only
    tx.partialSign(baseMintKeypair);

    // Derive pool address
    const poolAddress = deriveDbcPoolAddress(WRAPPED_SOL, baseMintKeypair.publicKey, configKey);
    const mintAddress = baseMintKeypair.publicKey.toBase58();
    const poolAddr = poolAddress.toBase58();
    
    // Serialize transaction for frontend to sign and send
    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

    notifyEvent({
      kind: 'dbc_pool_create',
      emoji: '📈',
      title: 'DBC pool created',
      fields: { name, symbol, network, mint: mintAddress, pool: poolAddr, creator: creatorWallet },
    });

    return NextResponse.json({
      ok: true,
      pool: poolAddr,
      config: configKey.toBase58(),
      mint: mintAddress,
      transaction: serializedTx,
      blockhash,
      lastValidBlockHeight,
      meteoraUrl: `https://app.meteora.ag/pools/${poolAddr}`,
      solscanUrl: network === "devnet"
        ? `https://orbmarkets.io/address/${mintAddress}?cluster=devnet&hideSpam=true`
        : `https://orbmarkets.io/address/${mintAddress}?hideSpam=true`,
    });
  } catch (e: any) {
    console.error("DBC pool creation error:", e);
    notifyEvent({
      kind: 'dbc_pool_create_error',
      emoji: '⚠️',
      title: 'DBC pool create failed',
      fields: { error: e?.message || String(e) },
    });
    return NextResponse.json(
      { error: e?.message || String(e), details: e?.logs || undefined },
      { status: 500 }
    );
  }
}
