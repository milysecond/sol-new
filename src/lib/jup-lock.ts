/**
 * Jupiter Lock (https://lock.jup.ag) - on-chain locker, no REST API.
 * Program LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn
 * Layout from jup-ag/jup-lock-starter (Codama).
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

export const JUP_LOCK_PROGRAM = new PublicKey(
  "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn",
);
export const MEMO_PROGRAM = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

const CREATE_V2 = u8a([181, 155, 104, 183, 182, 128, 35, 47]);
const CLAIM_V2 = u8a([229, 87, 46, 162, 21, 157, 231, 114]);
const CREATE_META = u8a([93, 78, 33, 103, 173, 125, 70, 0]);
/** Anchor disc for VestingEscrow - GPA memcmp base58 */
export const ESCROW_DISC_B58 = "hteFiUjrzUz";

function u8a(n: number[]): Uint8Array {
  return Uint8Array.from(n);
}
function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function u64le(n: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function u8(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff);
}
function borshStr(s: string): Uint8Array {
  const raw = new TextEncoder().encode(s);
  return concat([u32le(raw.length), raw]);
}
function readU64le(data: Uint8Array, o: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + o, 8);
  return view.getBigUint64(0, true);
}

/** Option::Some(RemainingAccountsInfo { slices: [] }) */
const REMAINING_NONE_SOME_EMPTY = u8a([1, 0, 0, 0, 0]);

const utf8 = (s: string) => new TextEncoder().encode(s);

export function eventAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8("__event_authority")],
    JUP_LOCK_PROGRAM,
  )[0];
}

export function escrowPda(base: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [utf8("escrow"), base.toBuffer()],
    JUP_LOCK_PROGRAM,
  );
}

export function escrowMetadataPda(escrow: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8("escrow_metadata"), escrow.toBuffer()],
    JUP_LOCK_PROGRAM,
  )[0];
}

export type ParsedLock = {
  address: string;
  recipient: string;
  creator: string;
  mint: string;
  base: string;
  bump: number;
  updateRecipientMode: number;
  cancelMode: number;
  token2022: boolean;
  cliffTime: number;
  frequency: number;
  cliffUnlockAmount: string;
  amountPerPeriod: string;
  numberOfPeriod: number;
  totalClaimedAmount: string;
  vestingStartTime: number;
  cancelledAt: number;
  unlockedAmount: string;
  claimableAmount: string;
};

export function parseVestingEscrow(pubkey: PublicKey, data: Uint8Array): ParsedLock | null {
  if (data.length < 8 + 32 * 4 + 8 + 8 * 9) return null;
  let o = 8;
  const recipient = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const mint = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const creator = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const base = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const bump = data[o]; o += 1;
  const updateRecipientMode = data[o]; o += 1;
  const cancelMode = data[o]; o += 1;
  const tokenProgramFlag = data[o]; o += 1;
  o += 4; // padding0
  const cliffTime = Number(readU64le(data, o)); o += 8;
  const frequency = Number(readU64le(data, o)); o += 8;
  const cliffUnlockAmount = readU64le(data, o); o += 8;
  const amountPerPeriod = readU64le(data, o); o += 8;
  const numberOfPeriod = Number(readU64le(data, o)); o += 8;
  const totalClaimedAmount = readU64le(data, o); o += 8;
  const vestingStartTime = Number(readU64le(data, o)); o += 8;
  const cancelledAt = Number(readU64le(data, o)); o += 8;

  const now = Math.floor(Date.now() / 1000);
  let unlocked = BigInt(0);
  if (cancelledAt === 0 && now >= cliffTime) {
    unlocked += cliffUnlockAmount;
    if (frequency > 0 && numberOfPeriod > 0) {
      const elapsed = Math.floor((now - cliffTime) / frequency);
      const periods = Math.min(Math.max(elapsed, 0), numberOfPeriod);
      unlocked += amountPerPeriod * BigInt(periods);
    }
  }
  const claimed = totalClaimedAmount;
  const claimable = unlocked > claimed ? unlocked - claimed : BigInt(0);

  return {
    address: pubkey.toBase58(),
    recipient: recipient.toBase58(),
    creator: creator.toBase58(),
    mint: mint.toBase58(),
    base: base.toBase58(),
    bump,
    updateRecipientMode,
    cancelMode,
    token2022: tokenProgramFlag === 1,
    cliffTime,
    frequency,
    cliffUnlockAmount: cliffUnlockAmount.toString(),
    amountPerPeriod: amountPerPeriod.toString(),
    numberOfPeriod,
    totalClaimedAmount: claimed.toString(),
    vestingStartTime,
    cancelledAt,
    unlockedAmount: unlocked.toString(),
    claimableAmount: claimable.toString(),
  };
}

export function tokenProgramFor(flag2022: boolean): PublicKey {
  return flag2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

export function buildCreateLockIxs(opts: {
  payer: PublicKey;
  base: Keypair;
  mint: PublicKey;
  token2022: boolean;
  recipient: PublicKey;
  amount: bigint;
  cliffUnix: number;
  title: string;
}): TransactionInstruction[] {
  const tokenProgram = tokenProgramFor(opts.token2022);
  const [escrow] = escrowPda(opts.base.publicKey);
  const senderAta = getAssociatedTokenAddressSync(
    opts.mint,
    opts.payer,
    false,
    tokenProgram,
  );
  const escrowAta = getAssociatedTokenAddressSync(
    opts.mint,
    escrow,
    true,
    tokenProgram,
  );
  const eventAuth = eventAuthorityPda();
  const now = Math.floor(Date.now() / 1000);
  const cliff = Math.max(opts.cliffUnix, now);

  const params = concat([
    u64le(now),
    u64le(cliff),
    u64le(1), // frequency 1s (unused when amountPerPeriod = 0)
    u64le(opts.amount), // full amount at cliff
    u64le(0),
    u64le(1), // one dummy period
    u8(0), // update recipient: none
    u8(1), // cancel: creator only
  ]);
  const data = concat([CREATE_V2, params, REMAINING_NONE_SOME_EMPTY]);

  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      opts.payer,
      senderAta,
      opts.payer,
      opts.mint,
      tokenProgram,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      opts.payer,
      escrowAta,
      escrow,
      opts.mint,
      tokenProgram,
    ),
    new TransactionInstruction({
      programId: JUP_LOCK_PROGRAM,
      keys: [
        { pubkey: opts.base.publicKey, isSigner: true, isWritable: true },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: opts.mint, isSigner: false, isWritable: false },
        { pubkey: escrowAta, isSigner: false, isWritable: true },
        { pubkey: opts.payer, isSigner: true, isWritable: true },
        { pubkey: senderAta, isSigner: false, isWritable: true },
        { pubkey: opts.recipient, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: eventAuth, isSigner: false, isWritable: false },
        { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    }),
  ];

  const title = (opts.title || "Lock").slice(0, 64);
  const meta = escrowMetadataPda(escrow);
  const metaData = concat([
    CREATE_META,
    borshStr(title),
    borshStr(title),
    borshStr(""),
    borshStr(""),
  ]);
  ixs.push(
    new TransactionInstruction({
      programId: JUP_LOCK_PROGRAM,
      keys: [
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: opts.payer, isSigner: true, isWritable: false },
        { pubkey: meta, isSigner: false, isWritable: true },
        { pubkey: opts.payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(metaData),
    }),
  );

  return ixs;
}

export function buildClaimIx(opts: {
  escrow: PublicKey;
  mint: PublicKey;
  recipient: PublicKey;
  token2022: boolean;
  maxAmount: bigint;
}): TransactionInstruction {
  const tokenProgram = tokenProgramFor(opts.token2022);
  const [escrowPdaKey] = [opts.escrow];
  const escrowAta = getAssociatedTokenAddressSync(
    opts.mint,
    escrowPdaKey,
    true,
    tokenProgram,
  );
  const recipientAta = getAssociatedTokenAddressSync(
    opts.mint,
    opts.recipient,
    false,
    tokenProgram,
  );
  const data = concat([
    CLAIM_V2,
    u64le(opts.maxAmount),
    REMAINING_NONE_SOME_EMPTY,
  ]);
  return new TransactionInstruction({
    programId: JUP_LOCK_PROGRAM,
    keys: [
      { pubkey: opts.escrow, isSigner: false, isWritable: true },
      { pubkey: opts.mint, isSigner: false, isWritable: false },
      { pubkey: escrowAta, isSigner: false, isWritable: true },
      { pubkey: opts.recipient, isSigner: true, isWritable: true },
      { pubkey: recipientAta, isSigner: false, isWritable: true },
      { pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: eventAuthorityPda(), isSigner: false, isWritable: false },
      { pubkey: JUP_LOCK_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function claimAtaIx(
  payer: PublicKey,
  mint: PublicKey,
  token2022: boolean,
): TransactionInstruction {
  const tokenProgram = tokenProgramFor(token2022);
  const ata = getAssociatedTokenAddressSync(mint, payer, false, tokenProgram);
  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    ata,
    payer,
    mint,
    tokenProgram,
  );
}

