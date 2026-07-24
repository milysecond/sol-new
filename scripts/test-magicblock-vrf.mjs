#!/usr/bin/env node
/**
 * Devnet E2E smoke test for fair-draw + MagicBlock VRF.
 *
 * Usage (from sol-new/):
 *   node --env-file=.env.local scripts/test-magicblock-vrf.mjs
 *
 * Env:
 *   MAGICBLOCK_FAIR_DRAW_PROGRAM_ID (default: EQmor7i… deployed id)
 *   SOL_FEE_PAYER_SECRET (JSON array or base58)
 *   MAGICBLOCK_CLUSTER=devnet
 *   DEVNET_RPC optional
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PROGRAM_ID = new PublicKey(
  process.env.MAGICBLOCK_FAIR_DRAW_PROGRAM_ID || "EQmor7iQN23PbKEUA9yHjsRujnb4csV9L8stussV3znp",
);
const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const ORACLE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
const DRAW_SEED = Buffer.from("fair-draw");
const IDENTITY_SEED = Buffer.from("identity");
const RPC =
  process.env.DEVNET_RPC?.trim() ||
  (process.env.HELIUS_API_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : "https://api.devnet.solana.com");

function loadFeePayer() {
  let raw = process.env.SOL_FEE_PAYER_SECRET || process.env.TREASURY_PRIVATE_KEY;
  if (!raw) {
    // fall back to fee keypair file used for deploy
    const path = resolve(ROOT, "feeUzA98vep5UvxQhwdQVBGsSFADqcYM7Dt4sLrpiyE.json");
    raw = readFileSync(path, "utf8");
  }
  raw = raw.trim();
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

function anchorDisc(name) {
  return sha256(Buffer.from(`global:${name}`)).subarray(0, 8);
}

async function main() {
  const payer = loadFeePayer();
  const conn = new Connection(RPC, "confirmed");
  const bal = await conn.getBalance(payer.publicKey);
  console.log("cluster: devnet");
  console.log("rpc:", RPC);
  console.log("program:", PROGRAM_ID.toBase58());
  console.log("payer:", payer.publicKey.toBase58(), "lamports:", bal);

  const progInfo = await conn.getAccountInfo(PROGRAM_ID);
  if (!progInfo?.executable) {
    throw new Error("fair-draw program not found/executable on this cluster");
  }
  const vrfInfo = await conn.getAccountInfo(VRF_PROGRAM);
  if (!vrfInfo?.executable) {
    throw new Error("MagicBlock VRF program missing on this cluster");
  }

  const drawId16 = randomBytes(16);
  const entries = ["alice", "bob", "carol"];
  const entriesHash = sha256(Buffer.from(entries.join("\n"))).toString("hex");
  const entryCount = entries.length;
  const callerSeed = sha256(
    Buffer.from(`magicblock|${drawId16.toString("hex")}|${entriesHash}|${entryCount}`),
  );

  const [drawPda] = PublicKey.findProgramAddressSync(
    [DRAW_SEED, drawId16],
    PROGRAM_ID,
  );
  const [programIdentity] = PublicKey.findProgramAddressSync([IDENTITY_SEED], PROGRAM_ID);

  const data = Buffer.alloc(8 + 16 + 32 + 4);
  anchorDisc("request_draw").copy(data, 0);
  drawId16.copy(data, 8);
  callerSeed.copy(data, 24);
  data.writeUInt32LE(entryCount, 56);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: drawPda, isSigner: false, isWritable: true },
      { pubkey: ORACLE_QUEUE, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programIdentity, isSigner: false, isWritable: false },
      { pubkey: VRF_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  console.log("draw_id:", drawId16.toString("hex"));
  console.log("draw_pda:", drawPda.toBase58());
  console.log("program_identity:", programIdentity.toBase58());
  console.log("submitting request_draw…");

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer], {
    commitment: "confirmed",
    maxRetries: 5,
  });
  console.log("request sig:", sig);
  console.log("explorer:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  const timeoutMs = Number(process.env.MAGICBLOCK_TEST_TIMEOUT_MS || 60_000);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await conn.getAccountInfo(drawPda, "confirmed");
    if (info?.data && info.data.length >= 8 + 32 + 16 + 4 + 32 + 1) {
      const body = info.data.subarray(8);
      const randomness = body.subarray(32 + 16 + 4, 32 + 16 + 4 + 32);
      const fulfilled = body[32 + 16 + 4 + 32] === 1;
      if (fulfilled) {
        const seedHex = Buffer.from(randomness).toString("hex");
        const value = BigInt("0x" + Buffer.from(randomness.subarray(0, 8)).toString("hex"));
        const winnerIndex = Number(value % BigInt(entryCount));
        console.log("FULFILLED");
        console.log("randomness:", seedHex);
        console.log("winner_index:", winnerIndex, "winner:", entries[winnerIndex]);
        console.log("elapsed_ms:", Date.now() - start);
        console.log("OK magicblock fair-draw e2e");
        return;
      }
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("\nTIMEOUT waiting for VRF callback after", timeoutMs, "ms");
  console.error("request still on-chain; check oracle health / queue");
  process.exit(2);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
