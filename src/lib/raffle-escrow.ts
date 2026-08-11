/**
 * Raffle prize escrow helpers — deposit to fee-payer wallet, payout to winner.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  connectionForNetwork,
  loadFeePayerKeypair,
  feePayerConfigured,
} from "@/lib/fee-payer";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export { feePayerConfigured };

export function raffleEscrowPubkey(): string {
  return loadFeePayerKeypair().publicKey.toBase58();
}

export async function resolveTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  try {
    await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    return TOKEN_2022_PROGRAM_ID;
  } catch {
    return TOKEN_PROGRAM_ID;
  }
}

export async function getMintDecimals(
  mintStr: string,
): Promise<{ decimals: number; programId: string }> {
  const connection = new Connection(mainnetRpcUrl(), "confirmed");
  const mint = new PublicKey(mintStr);
  const programId = await resolveTokenProgram(connection, mint);
  const m = await getMint(connection, mint, "confirmed", programId);
  return { decimals: m.decimals, programId: programId.toBase58() };
}

export function uiToRaw(amountUi: string, decimals: number): bigint {
  const s = amountUi.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt(whole || "0") * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
  if (raw <= BigInt(0)) throw new Error("Amount must be > 0");
  return raw;
}

/** Build deposit ix: creator → escrow ATA (creator pays fees) */
export function buildPrizeDepositInstructions(opts: {
  creator: PublicKey;
  escrow: PublicKey;
  mint: PublicKey;
  amountRaw: bigint;
  decimals: number;
  programId: PublicKey;
}) {
  const fromAta = getAssociatedTokenAddressSync(
    opts.mint,
    opts.creator,
    false,
    opts.programId,
  );
  const toAta = getAssociatedTokenAddressSync(
    opts.mint,
    opts.escrow,
    false,
    opts.programId,
  );
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      opts.creator,
      toAta,
      opts.escrow,
      opts.mint,
      opts.programId,
    ),
    createTransferCheckedInstruction(
      fromAta,
      opts.mint,
      toAta,
      opts.creator,
      opts.amountRaw,
      opts.decimals,
      [],
      opts.programId,
    ),
  ];
}

/** Escrow pays winner (escrow is fee payer + signer) */
export async function payoutPrizeFromEscrow(opts: {
  winner: string;
  mint: string;
  amountRaw: bigint;
  decimals: number;
  programId?: string;
}): Promise<{ signature: string }> {
  const payer = loadFeePayerKeypair();
  const connection = connectionForNetwork("mainnet");
  const mint = new PublicKey(opts.mint);
  const winner = new PublicKey(opts.winner);
  const programId = opts.programId
    ? new PublicKey(opts.programId)
    : await resolveTokenProgram(connection, mint);

  const fromAta = getAssociatedTokenAddressSync(
    mint,
    payer.publicKey,
    false,
    programId,
  );
  const toAta = getAssociatedTokenAddressSync(mint, winner, false, programId);

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      toAta,
      winner,
      mint,
      programId,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      payer.publicKey,
      opts.amountRaw,
      opts.decimals,
      [],
      programId,
    ),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return { signature };
}

/** Refund prize to creator */
export async function refundPrizeToCreator(opts: {
  creator: string;
  mint: string;
  amountRaw: bigint;
  decimals: number;
  programId?: string;
}): Promise<{ signature: string }> {
  return payoutPrizeFromEscrow({
    winner: opts.creator,
    mint: opts.mint,
    amountRaw: opts.amountRaw,
    decimals: opts.decimals,
    programId: opts.programId,
  });
}

export async function verifyDepositTx(opts: {
  signature: string;
  mint: string;
  escrow: string;
  amountRaw: bigint;
}): Promise<boolean> {
  const connection = new Connection(mainnetRpcUrl(), "confirmed");
  const tx = await connection.getParsedTransaction(opts.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || tx.meta?.err) return false;

  // Look for post token balances increase on escrow for mint
  const post = tx.meta?.postTokenBalances || [];
  const pre = tx.meta?.preTokenBalances || [];
  const escrow = opts.escrow;

  for (const p of post) {
    if (p.mint !== opts.mint) continue;
    if (p.owner !== escrow) continue;
    const preBal = pre.find(
      (x) => x.accountIndex === p.accountIndex || (x.owner === escrow && x.mint === opts.mint),
    );
    const postAmt = BigInt(p.uiTokenAmount?.amount || "0");
    const preAmt = BigInt(preBal?.uiTokenAmount?.amount || "0");
    if (postAmt - preAmt >= opts.amountRaw) return true;
  }
  return false;
}
