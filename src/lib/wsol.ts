/**
 * Native SOL ↔ WSOL helpers for Jupiter Lend and other SPL flows.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const WSOL_MINT = NATIVE_MINT.toBase58();

export function isWsolMint(mint: string | null | undefined): boolean {
  return Boolean(mint && mint === WSOL_MINT);
}

export function wsolAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(NATIVE_MINT, owner, false, TOKEN_PROGRAM_ID);
}

async function sendLegacy(
  connection: Connection,
  tx: Transaction,
  payer: Keypair
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

/**
 * Wrap native SOL into the owner's WSOL ATA (create ATA if needed).
 * @param uiAmount SOL amount (human)
 * @param extraLamports tiny buffer for protocol rounding (default 0)
 */
export async function wrapSol(
  connection: Connection,
  payer: Keypair,
  uiAmount: number,
  extraLamports = 0
): Promise<string> {
  if (!(uiAmount > 0)) throw new Error("Wrap amount must be positive");
  const lamports = Math.ceil(uiAmount * LAMPORTS_PER_SOL) + Math.max(0, extraLamports);
  const ata = wsolAta(payer.publicKey);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID
    ),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: ata,
      lamports,
    }),
    createSyncNativeInstruction(ata, TOKEN_PROGRAM_ID)
  );
  return sendLegacy(connection, tx, payer);
}

/** WSOL ATA ui balance (0 if missing). */
export async function getWsolUiBalance(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  try {
    const ata = wsolAta(owner);
    const res = await connection.getTokenAccountBalance(ata, "confirmed");
    return Number(res.value.uiAmount ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Unwrap all WSOL in the owner's ATA back to native SOL (close account).
 * Returns signature, or null if nothing to unwrap.
 */
export async function unwrapAllWsol(
  connection: Connection,
  payer: Keypair
): Promise<string | null> {
  const ata = wsolAta(payer.publicKey);
  let bal = 0;
  try {
    const res = await connection.getTokenAccountBalance(ata, "confirmed");
    bal = Number(res.value.amount || 0);
  } catch {
    return null;
  }
  if (bal <= 0) return null;

  const tx = new Transaction().add(
    createCloseAccountInstruction(
      ata,
      payer.publicKey,
      payer.publicKey,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  return sendLegacy(connection, tx, payer);
}
