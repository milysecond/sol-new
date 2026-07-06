import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";
import { db } from "./db";

// Programs the LazorKit execute path legitimately touches in the outer tx.
const LAZORKIT_PROGRAM = "Gsuz7YcA5sbMGVRXT3xSYhJBessW4xFC4xYsihNCqMFh";
const LAZORKIT_POLICY = "BiE9vSdz9MidUiyjVYsu3PG4C1fbPZ8CVPADA9jRfXw7";
const SECP256R1_PRECOMPILE = "Secp256r1SigVerify1111111111111111111111111";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TySNcWxMyWCqXgDLGmfcHr";

export const PAYMASTER_ALLOWED_PROGRAMS = new Set([
  ComputeBudgetProgram.programId.toBase58(),
  SECP256R1_PRECOMPILE,
  LAZORKIT_PROGRAM,
  LAZORKIT_POLICY,
  ATA_PROGRAM,
  SystemProgram.programId.toBase58(),
]);

export const RELAY_ALLOWED_PROGRAMS = new Set([
  ComputeBudgetProgram.programId.toBase58(),
  SystemProgram.programId.toBase58(),
  TOKEN_PROGRAM,
  TOKEN_2022,
  ATA_PROGRAM,
  MEMO_PROGRAM,
]);

// Per-wallet daily caps (lamports figure includes rent the relayer fronts).
const MAX_TX_PER_DAY = Number(process.env.RELAY_MAX_TX_PER_DAY || 25);
const MAX_LAMPORTS_PER_DAY = Number(process.env.RELAY_MAX_LAMPORTS_PER_DAY || 50_000_000); // 0.05 SOL
export const MAX_SUBSIDY_LAMPORTS = Number(process.env.RELAY_MAX_SUBSIDY_LAMPORTS || 5_000_000); // 0.005 SOL per tx

export function relayerKeypair(): Keypair {
  const secret = process.env.SOL_FEE_PAYER_SECRET;
  if (!secret) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  }
}

type ParsedTx =
  | { kind: "legacy"; tx: Transaction }
  | { kind: "versioned"; tx: VersionedTransaction };

export function parseTx(base64: string): ParsedTx {
  const bytes = Buffer.from(base64, "base64");
  try {
    return { kind: "versioned", tx: VersionedTransaction.deserialize(bytes) };
  } catch {
    return { kind: "legacy", tx: Transaction.from(bytes) };
  }
}

/** Static account keys + per-instruction program/account roles, shape-agnostic. */
function txAccounts(parsed: ParsedTx): {
  feePayer: string | null;
  instructions: { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[] }[];
  allSigners: string[];
} {
  if (parsed.kind === "legacy") {
    const tx = parsed.tx;
    return {
      feePayer: tx.feePayer?.toBase58() ?? null,
      instructions: tx.instructions.map((ix) => ({
        programId: ix.programId.toBase58(),
        accounts: ix.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
      })),
      allSigners: tx.signatures.map((s) => s.publicKey.toBase58()),
    };
  }
  const msg = parsed.tx.message;
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  return {
    feePayer: keys[0] ?? null,
    instructions: msg.compiledInstructions.map((ix) => ({
      programId: keys[ix.programIdIndex],
      accounts: ix.accountKeyIndexes.map((i) => ({
        pubkey: keys[i],
        isSigner: msg.isAccountSigner(i),
        isWritable: msg.isAccountWritable(i),
      })),
    })),
    allSigners: keys.slice(0, msg.header.numRequiredSignatures),
  };
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
  /** wallet the quota is charged to (first non-relayer signer) */
  wallet?: string;
}

/**
 * Static checks: the relayer key may ONLY be the fee payer, and every program
 * must be on the mode's allowlist. Never lets the relayer be a writable
 * account or instruction-level signer — it can pay fees, nothing else.
 */
export function staticGuard(parsed: ParsedTx, mode: "paymaster" | "relay", relayerPubkey: string): GuardResult {
  const { feePayer, instructions, allSigners } = txAccounts(parsed);
  if (feePayer !== relayerPubkey) return { ok: false, reason: "fee payer must be the relayer" };

  const allowed = mode === "paymaster" ? PAYMASTER_ALLOWED_PROGRAMS : RELAY_ALLOWED_PROGRAMS;
  for (const ix of instructions) {
    if (!allowed.has(ix.programId)) return { ok: false, reason: `program not allowed: ${ix.programId}` };
    for (const a of ix.accounts) {
      if (a.pubkey === relayerPubkey && (a.isWritable || a.isSigner)) {
        return { ok: false, reason: "relayer may only be fee payer" };
      }
    }
  }

  const wallet = allSigners.find((s) => s !== relayerPubkey) ?? instructions[0]?.accounts[0]?.pubkey;
  return { ok: true, wallet };
}

/** Simulation gate: reject if the relayer stands to lose more than MAX_SUBSIDY_LAMPORTS. */
export async function simulationGuard(
  conn: Connection,
  parsed: ParsedTx,
  relayerPubkey: string,
): Promise<GuardResult> {
  const relayer = new PublicKey(relayerPubkey);
  const before = await conn.getBalance(relayer);
  const sim =
    parsed.kind === "versioned"
      ? await conn.simulateTransaction(parsed.tx, { sigVerify: false, replaceRecentBlockhash: true, accounts: { encoding: "base64", addresses: [relayerPubkey] } })
      : await conn.simulateTransaction(parsed.tx, undefined, [relayer]);
  if (sim.value.err) return { ok: false, reason: `simulation failed: ${JSON.stringify(sim.value.err).slice(0, 120)}` };
  const post = sim.value.accounts?.[0];
  if (post) {
    const delta = before - Number(post.lamports);
    if (delta > MAX_SUBSIDY_LAMPORTS) return { ok: false, reason: `subsidy ${delta} exceeds cap ${MAX_SUBSIDY_LAMPORTS}` };
  }
  return { ok: true };
}

/** Daily quota check + increment (call after static guard resolves the wallet). */
export async function quotaGuard(wallet: string, lamportsEstimate: number): Promise<GuardResult> {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db.execute({
    sql: "SELECT tx_count, lamports_spent FROM relay_usage WHERE wallet = ? AND day = ?",
    args: [wallet, day],
  });
  const txCount = Number(row.rows[0]?.tx_count ?? 0);
  const spent = Number(row.rows[0]?.lamports_spent ?? 0);
  if (txCount >= MAX_TX_PER_DAY) return { ok: false, reason: "daily transaction cap reached" };
  if (spent + lamportsEstimate > MAX_LAMPORTS_PER_DAY) return { ok: false, reason: "daily subsidy cap reached" };
  await db.execute({
    sql: `INSERT INTO relay_usage (wallet, day, tx_count, lamports_spent) VALUES (?, ?, 1, ?)
          ON CONFLICT(wallet, day) DO UPDATE SET tx_count = tx_count + 1, lamports_spent = lamports_spent + ?`,
    args: [wallet, day, lamportsEstimate, lamportsEstimate],
  });
  return { ok: true };
}
