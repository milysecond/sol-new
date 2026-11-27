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
import {
  loadFeePayerKeypair,
  feePayerConfigured,
  enforceSponsorLimits,
  simulateFeePayerLoss,
  SponsorRejected,
} from "@/lib/fee-payer";
import {
  STAKE_ALLOWED_PROGRAMS,
  checkClientInstructions,
  feePayerOnlyPaysFees,
} from "@/lib/sponsor-policy";
import { mainnetRpcUrl } from "@/lib/rpc-server";
import {
  STAKE_FEE_BUFFER_LAMPORTS,
  MIN_STAKE_SOL,
  MIN_STAKE_LAMPORTS,
  STAKE_VALIDATORS,
} from "@/lib/stake-validators";

/** Fees the fee payer may lose per sponsored stake tx (2 signatures + margin). */
const MAX_STAKE_SPEND_LAMPORTS = 20_000;
const SPONSORED_VOTES = new Set(STAKE_VALIDATORS.map((v) => v.vote));

export { feePayerConfigured as stakeSponsorConfigured };

export async function buildSponsoredStakeTx(opts: {
  wallet: string;
  /** createWithSeed seed (≤32 bytes ascii) */
  seed: string;
  amountSol: number;
  vote: string;
  /** cf-connecting-ip, for durable sponsor rate limits */
  clientIp: string;
}): Promise<{
  tx: string;
  stakePubkey: string;
  feePayer: string;
  rentLamports: number;
  stakeLamports: number;
  sponsored: boolean;
}> {
  const seed = opts.seed;
  if (!seed || seed.length > 32) {
    throw new Error("Invalid stake seed");
  }
  const amountSol = opts.amountSol;
  if (!Number.isFinite(amountSol) || amountSol < MIN_STAKE_SOL) {
    throw new Error(`Minimum stake is ${MIN_STAKE_SOL} SOL (Solana network rule)`);
  }
  const stakeLamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  if (stakeLamports < MIN_STAKE_LAMPORTS) {
    throw new Error(`Minimum stake is ${MIN_STAKE_SOL} SOL (Solana network rule)`);
  }

  const from = new PublicKey(opts.wallet);
  const votePubkey = new PublicKey(opts.vote);
  const conn = new Connection(mainnetRpcUrl(), "confirmed");
  const rent = await conn.getMinimumBalanceForRentExemption(StakeProgram.space);
  const totalFromUser = stakeLamports + rent;

  const bal = await conn.getBalance(from, "confirmed");
  // Self-paid needs stake+rent+fees from user; sponsored still needs stake+rent
  const minSelf = totalFromUser + STAKE_FEE_BUFFER_LAMPORTS;
  if (bal < totalFromUser + 5_000) {
    throw new Error(
      `Not enough SOL. Need ~${(totalFromUser / LAMPORTS_PER_SOL).toFixed(4)} SOL for stake + rent (you have ${(bal / LAMPORTS_PER_SOL).toFixed(4)}).`
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

  // Prefer platform fee payer only if it has SOL
  const MIN_SPONSOR_LAMPORTS = 50_000; // ~0.00005 SOL
  let useSponsor = false;
  let feePayerKp: ReturnType<typeof loadFeePayerKeypair> | null = null;
  if (feePayerConfigured()) {
    try {
      feePayerKp = loadFeePayerKeypair();
      const fpBal = await conn.getBalance(feePayerKp.publicKey, "confirmed");
      useSponsor = fpBal >= MIN_SPONSOR_LAMPORTS;
      if (!useSponsor) {
        console.warn(
          "[stake] fee payer empty",
          feePayerKp.publicKey.toBase58(),
          fpBal
        );
      }
    } catch (e) {
      console.warn("[stake] fee payer load failed", e);
    }
  }

  // Security (audit C2 follow-up): only sponsor the exact create+delegate shape,
  // to an allowlisted validator, where the fee payer is never an instruction
  // account (e.g. wallet = fee payer would have staked the fee payer's own SOL).
  // Any check failing → fall through to the self-paid tx (user pays the fee).
  let sponsoredTx: VersionedTransaction | null = null;
  if (useSponsor && feePayerKp) {
    try {
      if (!SPONSORED_VOTES.has(votePubkey.toBase58())) {
        throw new SponsorRejected("Validator not eligible for sponsorship");
      }
      const check = checkClientInstructions(ixs, feePayerKp.publicKey, STAKE_ALLOWED_PROGRAMS, 4);
      if (!check.ok) throw new SponsorRejected(check.reason);
      const msg = new TransactionMessage({
        payerKey: feePayerKp.publicKey,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message();
      const vtx = new VersionedTransaction(msg);
      const final = feePayerOnlyPaysFees(vtx, feePayerKp.publicKey);
      if (!final.ok) throw new SponsorRejected(final.reason);
      await enforceSponsorLimits({ scope: "stake", clientIp: opts.clientIp, wallets: [from.toBase58()] });
      const loss = await simulateFeePayerLoss(conn, vtx, feePayerKp.publicKey);
      if (loss > MAX_STAKE_SPEND_LAMPORTS) throw new SponsorRejected("Stake would cost the fee payer too much");
      sponsoredTx = vtx;
    } catch (e) {
      console.warn("[stake] not sponsoring:", e instanceof Error ? e.message : e);
      sponsoredTx = null;
    }
  }

  if (sponsoredTx && feePayerKp) {
    const vtx = sponsoredTx;
    vtx.sign([feePayerKp]);
    return {
      tx: Buffer.from(vtx.serialize()).toString("base64"),
      stakePubkey: stakePubkey.toBase58(),
      feePayer: feePayerKp.publicKey.toBase58(),
      rentLamports: rent,
      stakeLamports,
      sponsored: true,
    };
  }

  // Self-paid: user is fee payer (needs a bit extra for network fee)
  if (bal < minSelf) {
    throw new Error(
      `Not enough SOL for stake + rent + network fee. Need ~${(minSelf / LAMPORTS_PER_SOL).toFixed(4)} SOL (you have ${(bal / LAMPORTS_PER_SOL).toFixed(4)}).`
    );
  }

  const tx = new Transaction().add(...ixs);
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;
  return {
    tx: Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    ).toString("base64"),
    stakePubkey: stakePubkey.toBase58(),
    feePayer: from.toBase58(),
    rentLamports: rent,
    stakeLamports,
    sponsored: false,
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
  if (!Number.isFinite(opts.amountSol) || opts.amountSol < MIN_STAKE_SOL) {
    throw new Error(`Minimum stake is ${MIN_STAKE_SOL} SOL (Solana network rule)`);
  }
  const from = new PublicKey(opts.wallet);
  const votePubkey = new PublicKey(opts.vote);
  const conn = new Connection(mainnetRpcUrl(), "confirmed");
  const rent = await conn.getMinimumBalanceForRentExemption(StakeProgram.space);
  const stakeLamports = Math.round(opts.amountSol * LAMPORTS_PER_SOL);
  if (stakeLamports < MIN_STAKE_LAMPORTS) {
    throw new Error(`Minimum stake is ${MIN_STAKE_SOL} SOL (Solana network rule)`);
  }
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
