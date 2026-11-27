/**
 * Allowlist for transactions the sol.new fee payer will co-sign (security audit C2).
 *
 * Sponsored flows today (traced from callers of /api/sponsor and sponsorAndSend):
 *  - Gift claim sweep (src/lib/gift-link.ts sweepGift → /api/sponsor):
 *      ATA CreateIdempotent (payer = fee payer), Token/Token-2022 TransferChecked
 *      + CloseAccount (authority = gift key), System Transfer (from = gift key).
 *  - Empty token-account close (src/app/api/rent/close): Token/Token-2022 CloseAccount
 *    (authority = user).
 *  - Optional ComputeBudget limit/price instructions.
 *
 * Everything else is rejected. The fee payer may appear ONLY as the transaction
 * fee payer (static account 0) and as the funding `payer` (account 0) of an
 * Associated Token Account create whose address checks out. It can never be a
 * System transfer source, a token authority, a close destination, an ATA owner,
 * or any other account. Address lookup tables are rejected (no sponsored flow uses
 * them, and they would hide accounts from this check).
 *
 * Pure module: no RPC, no env, no DB — unit tested in sponsor-policy.test.ts.
 */
import { PublicKey, VersionedTransaction } from "@solana/web3.js";

export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
export const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Hard caps. Tuned to the gift-sweep / rent-close shapes with headroom. */
export const SPONSOR_LIMITS = {
  maxInstructions: 32,
  /** Fee payer + gift/owner key (+ one spare). Each signature costs the payer 5000 lamports. */
  maxSignatures: 3,
  /** Each ATA create costs the fee payer ~0.00204 SOL of rent. */
  maxAtaCreates: 6,
  maxComputeUnitLimit: 400_000,
  /** micro-lamports per CU */
  maxComputeUnitPrice: 100_000,
  /** Worst-case priority fee the payer can be charged (lamports). */
  maxPriorityFeeLamports: 50_000,
} as const;

const SYS_TRANSFER = 2;
const TOKEN_CLOSE_ACCOUNT = 9;
const TOKEN_TRANSFER_CHECKED = 12;
const CB_SET_CU_LIMIT = 2;
const CB_SET_CU_PRICE = 3;
const CB_SET_LOADED_DATA_LIMIT = 4;
const DEFAULT_CU_PER_IX = 200_000;
const MAX_TX_CU = 1_400_000;

export type SponsorPolicyResult =
  | {
      ok: true;
      /** Non-fee-payer signers (gift key / token owner) — used for per-wallet rate limits. */
      signers: string[];
      /** Owners of ATAs the fee payer funds (claim recipients). */
      ataOwners: string[];
      ataCreates: number;
      numSignatures: number;
      maxPriorityFeeLamports: number;
    }
  | { ok: false; reason: string };

function fail(reason: string): SponsorPolicyResult {
  return { ok: false, reason };
}

function readU32(d: Uint8Array, off: number): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(off, true);
}
function readU64(d: Uint8Array, off: number): bigint {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(off, true);
}

/**
 * Validate a (legacy or v0) transaction against the sponsor allowlist.
 * `VersionedTransaction.deserialize` accepts both wire formats.
 */
export function checkSponsoredTransaction(
  tx: VersionedTransaction,
  feePayer: PublicKey,
): SponsorPolicyResult {
  const msg = tx.message;
  const keys = msg.staticAccountKeys;
  const lookups = "addressTableLookups" in msg ? msg.addressTableLookups : [];
  if (lookups && lookups.length > 0) return fail("Address lookup tables are not allowed");
  if (!keys.length || !keys[0]!.equals(feePayer)) return fail("Transaction fee payer is not sol.new");
  // Static keys are unique, but be explicit: the payer may only be index 0.
  for (let i = 1; i < keys.length; i++) {
    if (keys[i]!.equals(feePayer)) return fail("Fee payer appears more than once");
  }

  const numSignatures = msg.header.numRequiredSignatures;
  if (numSignatures > SPONSOR_LIMITS.maxSignatures) return fail("Too many signers");

  const ixs = msg.compiledInstructions;
  if (!ixs.length) return fail("Empty transaction");
  if (ixs.length > SPONSOR_LIMITS.maxInstructions) return fail("Too many instructions");

  const isSigner = (i: number) => msg.isAccountSigner(i);
  const signers = new Set<string>();
  const ataOwners = new Set<string>();
  let ataCreates = 0;
  let cuLimit: number | null = null;
  let cuPrice: bigint | null = null;
  let nonBudgetIxs = 0;

  for (let n = 0; n < ixs.length; n++) {
    const ix = ixs[n]!;
    const program = keys[ix.programIdIndex];
    if (!program) return fail(`Instruction ${n}: bad program index`);
    if (ix.programIdIndex === 0) return fail(`Instruction ${n}: fee payer used as program`);
    const data = ix.data;
    const acct = (pos: number) => {
      const idx = ix.accountKeyIndexes[pos];
      return idx === undefined ? undefined : keys[idx];
    };

    // ── Fee payer may only be the funding payer (position 0) of an ATA create ──
    const isAta = program.equals(ATA_PROGRAM);
    for (let pos = 0; pos < ix.accountKeyIndexes.length; pos++) {
      if (ix.accountKeyIndexes[pos] === 0 && !(isAta && pos === 0)) {
        return fail(`Instruction ${n}: fee payer used as a non-fee-payer account`);
      }
    }

    if (program.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
      const kind = data[0];
      if (kind === CB_SET_CU_LIMIT && data.length === 5) {
        if (cuLimit !== null) return fail("Duplicate compute unit limit");
        cuLimit = readU32(data, 1);
        if (cuLimit > SPONSOR_LIMITS.maxComputeUnitLimit) return fail("Compute unit limit too high");
      } else if (kind === CB_SET_CU_PRICE && data.length === 9) {
        if (cuPrice !== null) return fail("Duplicate compute unit price");
        cuPrice = readU64(data, 1);
        if (cuPrice > BigInt(SPONSOR_LIMITS.maxComputeUnitPrice)) return fail("Compute unit price too high");
      } else if (kind === CB_SET_LOADED_DATA_LIMIT && data.length === 5) {
        /* harmless */
      } else {
        return fail(`Instruction ${n}: compute budget instruction not allowed`);
      }
      continue;
    }
    nonBudgetIxs++;

    if (program.equals(SYSTEM_PROGRAM_ID)) {
      if (data.length !== 12 || readU32(data, 0) !== SYS_TRANSFER) {
        return fail(`Instruction ${n}: only System transfer is allowed`);
      }
      if (ix.accountKeyIndexes.length !== 2) return fail(`Instruction ${n}: malformed transfer`);
      const fromIdx = ix.accountKeyIndexes[0]!;
      if (!isSigner(fromIdx)) return fail(`Instruction ${n}: transfer source must sign`);
      signers.add(keys[fromIdx]!.toBase58());
      continue;
    }

    if (program.equals(TOKEN_PROGRAM) || program.equals(TOKEN_2022_PROGRAM)) {
      const kind = data[0];
      if (kind === TOKEN_TRANSFER_CHECKED) {
        // [source, mint, destination, authority]
        if (data.length !== 10 || ix.accountKeyIndexes.length !== 4) {
          return fail(`Instruction ${n}: malformed TransferChecked (multisig authority not allowed)`);
        }
        const authIdx = ix.accountKeyIndexes[3]!;
        if (!isSigner(authIdx)) return fail(`Instruction ${n}: token authority must sign`);
        signers.add(keys[authIdx]!.toBase58());
      } else if (kind === TOKEN_CLOSE_ACCOUNT) {
        // [account, destination, authority]
        if (data.length !== 1 || ix.accountKeyIndexes.length !== 3) {
          return fail(`Instruction ${n}: malformed CloseAccount (multisig authority not allowed)`);
        }
        const authIdx = ix.accountKeyIndexes[2]!;
        if (!isSigner(authIdx)) return fail(`Instruction ${n}: close authority must sign`);
        signers.add(keys[authIdx]!.toBase58());
      } else {
        return fail(`Instruction ${n}: token instruction ${kind} not allowed`);
      }
      continue;
    }

    if (isAta) {
      // Create = [] or [0]; CreateIdempotent = [1]. Accounts:
      // [payer, ata, owner, mint, system program, token program]
      const okData = data.length === 0 || (data.length === 1 && (data[0] === 0 || data[0] === 1));
      if (!okData) return fail(`Instruction ${n}: only ATA create is allowed`);
      if (ix.accountKeyIndexes.length !== 6) return fail(`Instruction ${n}: malformed ATA create`);
      const payer = acct(0)!;
      const ata = acct(1)!;
      const owner = acct(2)!;
      const mint = acct(3)!;
      const sys = acct(4)!;
      const tokenProg = acct(5)!;
      if (!sys.equals(SYSTEM_PROGRAM_ID)) return fail(`Instruction ${n}: bad ATA system program`);
      if (!tokenProg.equals(TOKEN_PROGRAM) && !tokenProg.equals(TOKEN_2022_PROGRAM)) {
        return fail(`Instruction ${n}: bad ATA token program`);
      }
      const [expected] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProg.toBuffer(), mint.toBuffer()],
        ATA_PROGRAM,
      );
      if (!expected.equals(ata)) return fail(`Instruction ${n}: ATA address mismatch`);
      if (payer.equals(feePayer)) {
        ataCreates++;
        if (ataCreates > SPONSOR_LIMITS.maxAtaCreates) return fail("Too many sponsored token accounts");
      }
      ataOwners.add(owner.toBase58());
      continue;
    }

    return fail(`Instruction ${n}: program ${program.toBase58()} is not allowed`);
  }

  // Priority fee bound: price × (explicit limit, or the runtime default).
  const effectiveLimit = cuLimit ?? Math.min(MAX_TX_CU, DEFAULT_CU_PER_IX * nonBudgetIxs);
  const priority = cuPrice === null ? 0 : Number((cuPrice * BigInt(effectiveLimit) + BigInt(999_999)) / BigInt(1_000_000));
  if (priority > SPONSOR_LIMITS.maxPriorityFeeLamports) return fail("Priority fee too high");

  // Every sponsored flow has at least one user-side signer (gift key / owner).
  if (signers.size === 0) return fail("No user signer");

  return {
    ok: true,
    signers: [...signers],
    ataOwners: [...ataOwners],
    ataCreates,
    numSignatures,
    maxPriorityFeeLamports: priority,
  };
}

// ── Server-built sponsored txs (/api/swap/build, /api/stake/build) ─────────

export const JUPITER_V6_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
export const STAKE_PROGRAM = new PublicKey("Stake11111111111111111111111111111111111111");

/** Programs a sponsored Jupiter swap may call (swap + wrap/unwrap SOL + ATA setup). */
export const SWAP_ALLOWED_PROGRAMS = [
  COMPUTE_BUDGET_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  ATA_PROGRAM,
  JUPITER_V6_PROGRAM,
];
/** Programs a sponsored native-stake create + delegate may call. */
export const STAKE_ALLOWED_PROGRAMS = [SYSTEM_PROGRAM_ID, STAKE_PROGRAM];

export const SWAP_LIMITS = {
  maxInstructions: 24,
  maxComputeUnitLimit: 1_000_000,
  defaultComputeUnitLimit: 400_000,
  maxPriorityFeeLamports: 50_000,
} as const;

export type IxLike = {
  programId: PublicKey;
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
  data: Uint8Array;
};

export type ClientIxResult = { ok: true; signers: string[] } | { ok: false; reason: string };

/**
 * Validate instructions that will be wrapped in a fee-payer-signed tx.
 * Strictest rule: the fee payer must not appear in ANY instruction account list
 * (signer, writable, authority, transfer source, owner — anything). With that,
 * no program can debit the fee payer beyond the transaction fee.
 */
export function checkClientInstructions(
  ixs: IxLike[],
  feePayer: PublicKey,
  allowedPrograms: PublicKey[],
  maxInstructions: number = SWAP_LIMITS.maxInstructions,
): ClientIxResult {
  if (!ixs.length) return { ok: false, reason: "No instructions" };
  if (ixs.length > maxInstructions) return { ok: false, reason: "Too many instructions" };
  const signers = new Set<string>();
  for (let n = 0; n < ixs.length; n++) {
    const ix = ixs[n]!;
    if (ix.programId.equals(feePayer)) return { ok: false, reason: `Instruction ${n}: fee payer used as program` };
    if (!allowedPrograms.some((p) => p.equals(ix.programId))) {
      return { ok: false, reason: `Instruction ${n}: program ${ix.programId.toBase58()} is not allowed` };
    }
    for (const k of ix.keys) {
      if (k.pubkey.equals(feePayer)) {
        return { ok: false, reason: `Instruction ${n}: fee payer appears in a client instruction` };
      }
      if (k.isSigner) signers.add(k.pubkey.toBase58());
    }
  }
  return { ok: true, signers: [...signers] };
}

/**
 * Replace client compute-budget instructions with capped ones: CU limit ≤ max
 * (default when absent) and CU price lowered so price × limit ≤ max priority fee.
 * Returns the non-budget instructions plus the capped budget instructions first.
 */
export function capComputeBudget(ixs: IxLike[]): { ixs: IxLike[]; limit: number; microLamports: number } {
  let limit: number | null = null;
  let price = BigInt(0);
  const rest: IxLike[] = [];
  for (const ix of ixs) {
    if (!ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
      rest.push(ix);
      continue;
    }
    const d = ix.data;
    if (d[0] === CB_SET_CU_LIMIT && d.length === 5) limit = readU32(d, 1);
    else if (d[0] === CB_SET_CU_PRICE && d.length === 9) price = readU64(d, 1);
    // anything else (heap frame, loaded-data limit) is dropped
  }
  const cuLimit = Math.min(limit ?? SWAP_LIMITS.defaultComputeUnitLimit, SWAP_LIMITS.maxComputeUnitLimit);
  const maxPrice = BigInt(Math.floor((SWAP_LIMITS.maxPriorityFeeLamports * 1_000_000) / cuLimit));
  const microLamports = Number(price < maxPrice ? price : maxPrice);
  const limitData = new Uint8Array(5);
  limitData[0] = CB_SET_CU_LIMIT;
  new DataView(limitData.buffer).setUint32(1, cuLimit, true);
  const priceData = new Uint8Array(9);
  priceData[0] = CB_SET_CU_PRICE;
  new DataView(priceData.buffer).setBigUint64(1, BigInt(microLamports), true);
  return {
    ixs: [
      { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data: limitData },
      { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data: priceData },
      ...rest,
    ],
    limit: cuLimit,
    microLamports,
  };
}

/**
 * Final check on a compiled tx before the fee payer signs: it is static key 0 and
 * no compiled instruction references index 0 (lookup-table indexes can't be 0).
 */
export function feePayerOnlyPaysFees(tx: VersionedTransaction, feePayer: PublicKey): { ok: true } | { ok: false; reason: string } {
  const msg = tx.message;
  const keys = msg.staticAccountKeys;
  if (!keys[0]?.equals(feePayer)) return { ok: false, reason: "Transaction fee payer is not sol.new" };
  for (let i = 1; i < keys.length; i++) {
    if (keys[i]!.equals(feePayer)) return { ok: false, reason: "Fee payer appears more than once" };
  }
  for (const ix of msg.compiledInstructions) {
    if (ix.programIdIndex === 0 || ix.accountKeyIndexes.includes(0)) {
      return { ok: false, reason: "Fee payer referenced by an instruction" };
    }
  }
  if (msg.header.numRequiredSignatures > SPONSOR_LIMITS.maxSignatures) return { ok: false, reason: "Too many signers" };
  return { ok: true };
}
