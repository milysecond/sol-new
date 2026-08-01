/**
 * Build native stake create+delegate tx with platform fee payer (server-only).
 */
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  StakeProgram,
  Authorized,
  Lockup,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { loadFeePayerKeypair, feePayerConfigured } from "@/lib/fee-payer";
import { mainnetRpcUrl } from "@/lib/rpc-server";
import { STAKE_FEE_BUFFER_LAMPORTS } from "@/lib/stake-validators";

export { feePayerConfigured as stakeSponsorConfigured };

export async function buildSponsoredStakeTx(opts: {
  wallet: string;
  /** createWithSeed seed (≤32 bytes ascii) */
  seed: string;
  amountSol: number;
  vote: string;
}): Promise<{
  tx: string;
  stakePubkey: string;
  feePayer: string;
  rentLamports: number;
  stakeLamports: number;
}> {
  if (!feePayerConfigured()) {
    throw new Error("Stake sponsorship unavailable");
  }
  const seed = opts.seed;
  if (!seed || seed.length > 32) {
    throw new Error("Invalid stake seed");
  }
  const amountSol = opts.amountSol;
  if (!Number.isFinite(amountSol) || amountSol < 0.001) {
    throw new Error("Amount too small");
  }

  const from = new PublicKey(opts.wallet);
  const votePubkey = new PublicKey(opts.vote);
  const feePayer = loadFeePayerKeypair();
  const conn = new Connection(mainnetRpcUrl(), "confirmed");

  const rent = await conn.getMinimumBalanceForRentExemption(StakeProgram.space);
  const stakeLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const totalFromUser = stakeLamports + rent;

  const bal = await conn.getBalance(from, "confirmed");
  if (bal < totalFromUser + STAKE_FEE_BUFFER_LAMPORTS) {
    throw new Error(
      `Not enough SOL. Need ~${((totalFromUser + STAKE_FEE_BUFFER_LAMPORTS) / LAMPORTS_PER_SOL).toFixed(4)} SOL (you have ${(bal / LAMPORTS_PER_SOL).toFixed(4)}).`
    );
  }

  const stakePubkey = await PublicKey.createWithSeed(
    from,
    seed,
    StakeProgram.programId
  );

  const existing = await conn.getAccountInfo(stakePubkey, "confirmed");
  if (existing) {
    throw new Error("Stake account already exists — tap Stake again.");
  }

  const createTx = StakeProgram.createAccountWithSeed({
    fromPubkey: from,
    stakePubkey,
    basePubkey: from,
    seed,
    authorized: new Authorized(from, from),
    lockup: new Lockup(0, 0, PublicKey.default),
    lamports: totalFromUser,
  });
  const delegateTx = StakeProgram.delegate({
    stakePubkey,
    authorizedPubkey: from,
    votePubkey,
  });

  const ixs = [...createTx.instructions, ...delegateTx.instructions];
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const vtx = new VersionedTransaction(msg);
  vtx.sign([feePayer]);

  // Do NOT simulate here: user hasn't signed yet (base authority). RPC often
  // returns AccountNotFound on partially-signed createAccountWithSeed.
  // Client preflight runs after passkey sign.

  return {
    tx: Buffer.from(vtx.serialize()).toString("base64"),
    stakePubkey: stakePubkey.toBase58(),
    feePayer: feePayer.publicKey.toBase58(),
    rentLamports: rent,
    stakeLamports,
  };
}

/** Legacy path without sponsor — returns unsigned legacy tx bytes for client sign. */
export async function buildSelfPaidStakeTx(opts: {
  wallet: string;
  seed: string;
  amountSol: number;
  vote: string;
}): Promise<{
  tx: string;
  stakePubkey: string;
  rentLamports: number;
}> {
  const from = new PublicKey(opts.wallet);
  const votePubkey = new PublicKey(opts.vote);
  const conn = new Connection(mainnetRpcUrl(), "confirmed");
  const rent = await conn.getMinimumBalanceForRentExemption(StakeProgram.space);
  const stakeLamports = Math.round(opts.amountSol * LAMPORTS_PER_SOL);
  const totalFromUser = stakeLamports + rent;
  const bal = await conn.getBalance(from, "confirmed");
  if (bal < totalFromUser + STAKE_FEE_BUFFER_LAMPORTS) {
    throw new Error(
      `Not enough SOL. Need ~${((totalFromUser + STAKE_FEE_BUFFER_LAMPORTS) / LAMPORTS_PER_SOL).toFixed(4)} (have ${(bal / LAMPORTS_PER_SOL).toFixed(4)}).`
    );
  }
  const stakePubkey = await PublicKey.createWithSeed(
    from,
    opts.seed,
    StakeProgram.programId
  );
  const createTx = StakeProgram.createAccountWithSeed({
    fromPubkey: from,
    stakePubkey,
    basePubkey: from,
    seed: opts.seed,
    authorized: new Authorized(from, from),
    lockup: new Lockup(0, 0, PublicKey.default),
    lamports: totalFromUser,
  });
  const delegateTx = StakeProgram.delegate({
    stakePubkey,
    authorizedPubkey: from,
    votePubkey,
  });
  const tx = new Transaction().add(
    ...createTx.instructions,
    ...delegateTx.instructions
  );
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  return {
    tx: Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    ).toString("base64"),
    stakePubkey: stakePubkey.toBase58(),
    rentLamports: rent,
  };
}
