/**
 * Platform SOL fee payer (server-only).
 * Env: SOL_FEE_PAYER_SECRET | TREASURY_PRIVATE_KEY (bs58 or JSON byte array)
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { mainnetRpcUrl, rpcUrlFor } from "@/lib/rpc-server";

export function feePayerConfigured(): boolean {
  return Boolean(
    process.env.SOL_FEE_PAYER_SECRET?.trim() ||
      process.env.TREASURY_PRIVATE_KEY?.trim()
  );
}

export function loadFeePayerKeypair(): Keypair {
  const raw =
    process.env.SOL_FEE_PAYER_SECRET?.trim() ||
    process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    const arr = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
}

export function feePayerPubkey(): string {
  return loadFeePayerKeypair().publicKey.toBase58();
}

export function connectionForNetwork(network?: string): Connection {
  const n = network === "devnet" ? "devnet" : "mainnet";
  try {
    return new Connection(rpcUrlFor(n as "mainnet" | "devnet"), "confirmed");
  } catch {
    return new Connection(mainnetRpcUrl(), "confirmed");
  }
}

/**
 * Co-sign a client-built tx where feePayer is our key.
 * Client must already have set feePayer + partial-signed other required signers.
 */
export async function sponsorAndSend(opts: {
  transactionBase64: string;
  network?: string;
  /** Max lamports we allow the fee payer to spend (default 0.01 SOL) */
  maxFeeLamports?: number;
}): Promise<{ signature: string; feePayer: string }> {
  const payer = loadFeePayerKeypair();
  const conn = connectionForNetwork(opts.network);
  const maxFee = opts.maxFeeLamports ?? 10_000_000; // 0.01 SOL
  const raw = Buffer.from(opts.transactionBase64, "base64");

  // Versioned tx path
  try {
    const vtx = VersionedTransaction.deserialize(raw);
    const accountKeys = vtx.message.getAccountKeys();
    const fp = accountKeys.get(0);
    if (!fp || !fp.equals(payer.publicKey)) {
      throw new Error("Transaction fee payer is not sol.new");
    }

    const sim = await conn.simulateTransaction(vtx, {
      sigVerify: false,
      replaceRecentBlockhash: false,
    });
    if (sim.value.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
    }

    vtx.sign([payer]);
    const sig = await conn.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await conn.confirmTransaction(sig, "confirmed");
    return { signature: sig, feePayer: payer.publicKey.toBase58() };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("fee payer is not") ||
        e.message.includes("Simulation failed"))
    ) {
      throw e;
    }
    // fall through to legacy
  }

  const tx = Transaction.from(raw);
  if (!tx.feePayer?.equals(payer.publicKey)) {
    throw new Error("Transaction fee payer is not sol.new");
  }

  for (const ix of tx.instructions) {
    if (
      ix.programId.equals(SystemProgram.programId) &&
      ix.data.length >= 12 &&
      ix.data[0] === 2 &&
      ix.keys[0]?.pubkey.equals(payer.publicKey)
    ) {
      const lamports = Number(Buffer.from(ix.data).readBigUInt64LE(4));
      if (lamports > maxFee) {
        throw new Error("Sponsored transfer from fee payer too large");
      }
    }
  }

  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
  }

  tx.partialSign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, feePayer: payer.publicKey.toBase58() };
}
