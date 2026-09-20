/**
 * Native SOL <-> WSOL helpers for Jupiter Lend and other SPL flows.
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
  createInitializeAccountInstruction,
  createSyncNativeInstruction,
  createTransferCheckedInstruction,
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
  payer: Keypair,
  extra: Keypair[] = []
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, ...extra);
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
export function buildWrapTx(
  owner: PublicKey,
  uiAmount: number,
  extraLamports = 0
): Transaction {
  if (!(uiAmount > 0)) throw new Error("Wrap amount must be positive");
  const lamports = Math.ceil(uiAmount * LAMPORTS_PER_SOL) + Math.max(0, extraLamports);
  const ata = wsolAta(owner);
  return new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      ata,
      owner,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID
    ),
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: ata,
      lamports,
    }),
    createSyncNativeInstruction(ata, TOKEN_PROGRAM_ID)
  );
}

export async function wrapSol(
  connection: Connection,
  payer: Keypair,
  uiAmount: number,
  extraLamports = 0
): Promise<string> {
  return sendLegacy(connection, buildWrapTx(payer.publicKey, uiAmount, extraLamports), payer);
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

/**
 * Unwrap wSOL back to native SOL.
 * Full amount closes the ATA. Partial uses a temp account then closes it.
 */
export async function buildUnwrapTx(
  connection: Connection,
  owner: PublicKey,
  uiAmount: number
): Promise<{ tx: Transaction; extra: Keypair[] }> {
  if (!(uiAmount > 0)) throw new Error("Unwrap amount must be positive");
  const ata = wsolAta(owner);
  let raw = 0;
  try {
    const res = await connection.getTokenAccountBalance(ata, "confirmed");
    raw = Number(res.value.amount || 0);
  } catch {
    throw new Error("No wSOL in this wallet");
  }
  const want = Math.round(uiAmount * LAMPORTS_PER_SOL);
  if (want > raw) throw new Error("Not enough wSOL");
  if (want === raw) {
    const tx = new Transaction().add(
      createCloseAccountInstruction(ata, owner, owner, [], TOKEN_PROGRAM_ID)
    );
    return { tx, extra: [] };
  }

  const tmp = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(165);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: tmp.publicKey,
      lamports: rent,
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(tmp.publicKey, NATIVE_MINT, owner, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(
      ata,
      NATIVE_MINT,
      tmp.publicKey,
      owner,
      want,
      9,
      [],
      TOKEN_PROGRAM_ID
    ),
    createCloseAccountInstruction(tmp.publicKey, owner, owner, [], TOKEN_PROGRAM_ID)
  );
  return { tx, extra: [tmp] };
}

export async function unwrapSol(
  connection: Connection,
  payer: Keypair,
  uiAmount: number
): Promise<string> {
  const { tx, extra } = await buildUnwrapTx(connection, payer.publicKey, uiAmount);
  return sendLegacy(connection, tx, payer, extra);
}
