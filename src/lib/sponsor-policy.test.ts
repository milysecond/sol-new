/**
 * Sponsor allowlist tests (audit C2). Run: npm run test:sponsor
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Authorized,
  ComputeBudgetProgram,
  Keypair,
  Lockup,
  StakeProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ATA_PROGRAM,
  JUPITER_V6_PROGRAM,
  STAKE_ALLOWED_PROGRAMS,
  SWAP_ALLOWED_PROGRAMS,
  SWAP_LIMITS,
  capComputeBudget,
  checkClientInstructions,
  feePayerOnlyPaysFees,
  SPONSOR_LIMITS,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  checkSponsoredTransaction,
} from "./sponsor-policy";

const feePayer = Keypair.generate();
const gift = Keypair.generate();
const user = Keypair.generate().publicKey;
const attacker = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const BLOCKHASH = "11111111111111111111111111111111";

function ata(owner: PublicKey, m: PublicKey, prog = TOKEN_PROGRAM) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), prog.toBuffer(), m.toBuffer()], ATA_PROGRAM)[0];
}
function u64(n: bigint) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}
function ataCreate(payer: PublicKey, owner: PublicKey, m = mint, prog = TOKEN_PROGRAM) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata(owner, m, prog), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: m, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: prog, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}
function transferChecked(src: PublicKey, dst: PublicKey, authority: PublicKey, prog = TOKEN_PROGRAM) {
  return new TransactionInstruction({
    programId: prog,
    keys: [
      { pubkey: src, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dst, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([12, ...u64(BigInt(1_000_000)), 6]),
  });
}
function closeAccount(account: PublicKey, dest: PublicKey, authority: PublicKey, prog = TOKEN_PROGRAM) {
  return new TransactionInstruction({
    programId: prog,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([9]),
  });
}

/** Legacy wire format, round-tripped exactly like /api/sponsor receives it. */
function legacy(ixs: TransactionInstruction[]) {
  const tx = new Transaction({ feePayer: feePayer.publicKey, recentBlockhash: BLOCKHASH }).add(...ixs);
  const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return VersionedTransaction.deserialize(raw);
}
function v0(ixs: TransactionInstruction[]) {
  const msg = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: ixs,
  }).compileToV0Message();
  return VersionedTransaction.deserialize(new VersionedTransaction(msg).serialize());
}
const both = (ixs: TransactionInstruction[]) => [
  ["legacy", legacy(ixs)],
  ["v0", v0(ixs)],
] as const;

function allow(ixs: TransactionInstruction[]) {
  for (const [kind, tx] of both(ixs)) {
    const r = checkSponsoredTransaction(tx, feePayer.publicKey);
    assert.equal(r.ok, true, `${kind}: expected allow, got ${r.ok ? "" : r.reason}`);
  }
}
function reject(ixs: TransactionInstruction[], match?: RegExp) {
  for (const [kind, tx] of both(ixs)) {
    const r = checkSponsoredTransaction(tx, feePayer.publicKey);
    assert.equal(r.ok, false, `${kind}: expected reject`);
    if (match && !r.ok) assert.match(r.reason, match, `${kind}: ${r.reason}`);
  }
}

// ── Allowed: the real sponsored flows ─────────────────────────────────────

test("allows the gift-claim sweep (SOL only)", () => {
  allow([SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 10_000_000 })]);
});

test("allows the gift-claim sweep with SPL + Token-2022 tokens", () => {
  const m22 = Keypair.generate().publicKey;
  allow([
    ataCreate(feePayer.publicKey, user),
    transferChecked(ata(gift.publicKey, mint), ata(user, mint), gift.publicKey),
    closeAccount(ata(gift.publicKey, mint), user, gift.publicKey),
    ataCreate(feePayer.publicKey, user, m22, TOKEN_2022_PROGRAM),
    transferChecked(ata(gift.publicKey, m22, TOKEN_2022_PROGRAM), ata(user, m22, TOKEN_2022_PROGRAM), gift.publicKey, TOKEN_2022_PROGRAM),
    closeAccount(ata(gift.publicKey, m22, TOKEN_2022_PROGRAM), user, gift.publicKey, TOKEN_2022_PROGRAM),
    SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 2_000_000 }),
  ]);
});

test("allows the rent-close batch (owner signs, rent to owner)", () => {
  const owner = Keypair.generate().publicKey;
  allow(Array.from({ length: 8 }, () => closeAccount(Keypair.generate().publicKey, owner, owner)));
});

test("allows capped compute budget instructions", () => {
  allow([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 1 }),
  ]);
});

test("reports user signers and ATA owners for rate limiting", () => {
  const r = checkSponsoredTransaction(
    legacy([
      ataCreate(feePayer.publicKey, user),
      transferChecked(ata(gift.publicKey, mint), ata(user, mint), gift.publicKey),
    ]),
    feePayer.publicKey,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.signers, [gift.publicKey.toBase58()]);
  assert.deepEqual(r.ataOwners, [user.toBase58()]);
  assert.equal(r.ataCreates, 1);
});

// ── Rejected: drains and abuse ────────────────────────────────────────────

test("rejects a System transfer out of the fee payer (the original drain)", () => {
  reject([SystemProgram.transfer({ fromPubkey: feePayer.publicKey, toPubkey: attacker, lamports: 1 })], /fee payer/);
});

test("rejects many small transfers out of the fee payer", () => {
  reject(
    Array.from({ length: 10 }, () =>
      SystemProgram.transfer({ fromPubkey: feePayer.publicKey, toPubkey: attacker, lamports: 9_000_000 }),
    ),
    /fee payer/,
  );
});

test("rejects CreateAccount funded by the fee payer", () => {
  const newAcct = Keypair.generate().publicKey;
  reject(
    [
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: newAcct,
        lamports: 1_000_000_000,
        space: 0,
        programId: SystemProgram.programId,
      }),
    ],
    /fee payer/,
  );
});

test("rejects other System instructions even without the fee payer", () => {
  reject([SystemProgram.assign({ accountPubkey: gift.publicKey, programId: attacker })], /only System transfer/);
  reject(
    // TransferWithSeed (SystemProgram.transfer with basePubkey/seed)
    [SystemProgram.transfer({
      fromPubkey: gift.publicKey, basePubkey: gift.publicKey, toPubkey: attacker,
      lamports: 1, seed: "x", programId: SystemProgram.programId,
    })],
    /only System transfer/,
  );
});

test("rejects the fee payer as a token authority", () => {
  reject([transferChecked(ata(feePayer.publicKey, mint), ata(attacker, mint), feePayer.publicKey)], /fee payer/);
});

test("rejects closing an account to the fee payer or with it as authority", () => {
  reject([closeAccount(ata(gift.publicKey, mint), feePayer.publicKey, gift.publicKey)], /fee payer/);
  reject([closeAccount(ata(feePayer.publicKey, mint), attacker, feePayer.publicKey)], /fee payer/);
});

test("rejects token authority changes (SetAuthority / Approve)", () => {
  const setAuthority = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: ata(gift.publicKey, mint), isSigner: false, isWritable: true },
      { pubkey: gift.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([6, 2, 1, ...attacker.toBytes()]),
  });
  reject([setAuthority], /token instruction 6/);
  const approve = new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: ata(gift.publicKey, mint), isSigner: false, isWritable: true },
      { pubkey: attacker, isSigner: false, isWritable: false },
      { pubkey: gift.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([4, ...u64(BigInt(1))]),
  });
  reject([approve], /token instruction 4/);
});

test("rejects an ATA whose owner is the fee payer", () => {
  reject([ataCreate(gift.publicKey, feePayer.publicKey)], /fee payer/);
});

test("rejects an ATA create with a forged address or token program", () => {
  const bad = ataCreate(feePayer.publicKey, user);
  bad.keys[1] = { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true };
  reject([bad], /ATA address mismatch/);
  const badProg = ataCreate(feePayer.publicKey, user);
  badProg.keys[5] = { pubkey: attacker, isSigner: false, isWritable: false };
  reject([badProg], /bad ATA token program/);
});

test("rejects too many sponsored ATA creates", () => {
  const ixs = Array.from({ length: SPONSOR_LIMITS.maxAtaCreates + 1 }, () =>
    ataCreate(feePayer.publicKey, user, Keypair.generate().publicKey),
  );
  reject(ixs, /Too many sponsored token accounts/);
});

test("rejects unknown programs", () => {
  reject(
    [new TransactionInstruction({ programId: attacker, keys: [{ pubkey: gift.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([1]) })],
    /not allowed/,
  );
});

test("rejects a fee payer that isn't sol.new", () => {
  const tx = new Transaction({ feePayer: gift.publicKey, recentBlockhash: BLOCKHASH }).add(
    SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 1 }),
  );
  const v = VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  const r = checkSponsoredTransaction(v, feePayer.publicKey);
  assert.equal(r.ok, false);
});

test("rejects compute unit price/limit above the caps", () => {
  const t = SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 1 });
  reject([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SPONSOR_LIMITS.maxComputeUnitPrice + 1 }), t], /price too high/);
  reject([ComputeBudgetProgram.setComputeUnitLimit({ units: SPONSOR_LIMITS.maxComputeUnitLimit + 1 }), t], /limit too high/);
  reject([ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }), t], /compute budget/);
  // Price within cap but no explicit limit across many ixs → priority fee cap
  reject(
    [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: SPONSOR_LIMITS.maxComputeUnitPrice }),
      ...Array.from({ length: 6 }, () => t),
    ],
    /Priority fee too high/,
  );
});

test("rejects too many signers", () => {
  const extra = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];
  reject(extra.map((k) => SystemProgram.transfer({ fromPubkey: k, toPubkey: user, lamports: 1 })), /Too many signers/);
});

test("rejects address lookup tables (v0)", () => {
  const msg = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: user, lamports: 1 })],
  }).compileToV0Message([
    {
      key: Keypair.generate().publicKey,
      state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: [user] },
      isActive: () => true,
    } as never,
  ]);
  const r = checkSponsoredTransaction(new VersionedTransaction(msg), feePayer.publicKey);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /lookup/);
});

// ── /api/swap/build and /api/stake/build (server-built, fee-payer-signed) ──

const trader = Keypair.generate().publicKey;
function jupSwap(extraKeys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = []) {
  return new TransactionInstruction({
    programId: JUPITER_V6_PROGRAM,
    keys: [
      { pubkey: trader, isSigner: true, isWritable: false },
      { pubkey: ata(trader, mint), isSigner: false, isWritable: true },
      ...extraKeys,
    ],
    data: Buffer.from([0xe5, 0x17, 0xcb, 0x97, 1, 2, 3]),
  });
}
const jupSetup = () => [
  ataCreate(trader, trader),
  SystemProgram.transfer({ fromPubkey: trader, toPubkey: ata(trader, mint), lamports: 1_000_000 }),
  new TransactionInstruction({ programId: TOKEN_PROGRAM, keys: [{ pubkey: ata(trader, mint), isSigner: false, isWritable: true }], data: Buffer.from([17]) }),
];

test("swap: allows a normal Jupiter swap (setup + swap + unwrap)", () => {
  const ixs = [...jupSetup(), jupSwap(), closeAccount(ata(trader, mint), trader, trader)];
  const r = checkClientInstructions(ixs, feePayer.publicKey, SWAP_ALLOWED_PROGRAMS);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  assert.deepEqual(r.signers, [trader.toBase58()]);
});

test("swap: rejects the fee payer anywhere in client instructions", () => {
  const cases = [
    SystemProgram.transfer({ fromPubkey: feePayer.publicKey, toPubkey: attacker, lamports: 1 }),
    jupSwap([{ pubkey: feePayer.publicKey, isSigner: false, isWritable: true }]),
    jupSwap([{ pubkey: feePayer.publicKey, isSigner: true, isWritable: false }]),
    jupSwap([{ pubkey: feePayer.publicKey, isSigner: false, isWritable: false }]),
    ataCreate(feePayer.publicKey, trader),
    closeAccount(ata(trader, mint), feePayer.publicKey, trader),
    transferChecked(ata(feePayer.publicKey, mint), ata(attacker, mint), feePayer.publicKey),
  ];
  for (const ix of cases) {
    const r = checkClientInstructions([jupSwap(), ix], feePayer.publicKey, SWAP_ALLOWED_PROGRAMS);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /fee payer/);
  }
});

test("swap: rejects programs outside the allowlist and oversized swaps", () => {
  const evil = new TransactionInstruction({ programId: attacker, keys: [], data: Buffer.from([1]) });
  const r = checkClientInstructions([jupSwap(), evil], feePayer.publicKey, SWAP_ALLOWED_PROGRAMS);
  assert.equal(r.ok, false);
  const many = Array.from({ length: SWAP_LIMITS.maxInstructions + 1 }, () => jupSwap());
  assert.equal(checkClientInstructions(many, feePayer.publicKey, SWAP_ALLOWED_PROGRAMS).ok, false);
});

test("swap: compute budget is replaced with capped values", () => {
  const { ixs, limit, microLamports } = capComputeBudget([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000_000 }),
    ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    jupSwap(),
  ]);
  assert.equal(limit, SWAP_LIMITS.maxComputeUnitLimit);
  assert.ok((limit * microLamports) / 1_000_000 <= SWAP_LIMITS.maxPriorityFeeLamports);
  assert.equal(ixs.length, 3); // limit + price + swap (heap frame dropped)
  const low = capComputeBudget([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10 }), jupSwap()]);
  assert.equal(low.limit, SWAP_LIMITS.defaultComputeUnitLimit);
  assert.equal(low.microLamports, 10);
});

test("compiled tx: fee payer may only pay fees", () => {
  const good = v0([jupSwap()]);
  assert.ok(feePayerOnlyPaysFees(good, feePayer.publicKey).ok);
  const bad = v0([SystemProgram.transfer({ fromPubkey: feePayer.publicKey, toPubkey: attacker, lamports: 1 })]);
  assert.equal(feePayerOnlyPaysFees(bad, feePayer.publicKey).ok, false);
  const other = v0([jupSwap()]);
  assert.equal(feePayerOnlyPaysFees(other, attacker).ok, false);
});

function stakeIxs(from: PublicKey) {
  const stake = Keypair.generate().publicKey;
  const vote = Keypair.generate().publicKey;
  return [
    ...StakeProgram.createAccountWithSeed({
      fromPubkey: from, stakePubkey: stake, basePubkey: from, seed: "sn1",
      authorized: new Authorized(from, from), lockup: new Lockup(0, 0, PublicKey.default), lamports: 1_000_000_000,
    }).instructions,
    ...StakeProgram.delegate({ stakePubkey: stake, authorizedPubkey: from, votePubkey: vote }).instructions,
  ];
}

test("stake: allows create-with-seed + delegate from the user", () => {
  const r = checkClientInstructions(stakeIxs(trader), feePayer.publicKey, STAKE_ALLOWED_PROGRAMS, 4);
  assert.ok(r.ok, r.ok ? "" : r.reason);
});

test("stake: rejects wallet = fee payer (would stake the fee payer's SOL)", () => {
  const r = checkClientInstructions(stakeIxs(feePayer.publicKey), feePayer.publicKey, STAKE_ALLOWED_PROGRAMS, 4);
  assert.equal(r.ok, false);
});

test("stake: rejects non-stake programs", () => {
  const r = checkClientInstructions([...stakeIxs(trader), jupSwap()], feePayer.publicKey, STAKE_ALLOWED_PROGRAMS, 4);
  assert.equal(r.ok, false);
});
