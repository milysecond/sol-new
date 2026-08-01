import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { usdcMint } from "./usdc";
import type { Network } from "./network";

export type GiftToken = "SOL" | "USDC";
export const USDC_DECIMALS = 6;

// Fee reserve for the claim transaction (one signature). Funded by the sender
// on top of the gift amount so the recipient nets exactly what was promised.
export const CLAIM_FEE_LAMPORTS = 5000;

// For USDC gifts the gift wallet also fronts the recipient's token-account
// rent (~0.00204 SOL) plus fees; the rent comes back to the recipient when the
// gift's own token account is closed during the claim.
export const USDC_GIFT_FUND_LAMPORTS = 2_100_000;

// ─── Secret codec ─────────────────────────────────────────────────────────────
// The gift wallet is derived from a 32-byte seed carried in the URL *fragment*,
// which browsers never send to the server — the link itself is the only key.

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function createGiftKeypair(): { keypair: Keypair; secret: string } {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return { keypair: Keypair.fromSeed(seed), secret: toBase64Url(seed) };
}

export function keypairFromSecret(secret: string): Keypair | null {
  try {
    const seed = fromBase64Url(secret);
    if (seed.length !== 32) return null;
    return Keypair.fromSeed(seed);
  } catch {
    return null;
  }
}

// ─── URL codec ────────────────────────────────────────────────────────────────

export function buildGiftUrl(
  secret: string,
  network: Network,
  message?: string,
  origin = "https://sol.new"
): string {
  const params = new URLSearchParams();
  if (network === "devnet") params.set("n", "d");
  if (message?.trim()) params.set("m", message.trim().slice(0, 80));
  const qs = params.toString();
  const base = origin.replace(/\/$/, "");
  return `${base}/claim${qs ? `?${qs}` : ""}#${secret}`;
}

export function parseGiftSecret(hash: string): string | null {
  const secret = hash.replace(/^#/, "").trim();
  return secret.length > 0 ? secret : null;
}

/** Parse UI amount → base units (lamports or USDC 6dp). */
export function giftAmountToBase(amountUi: number, token: GiftToken): number {
  if (!Number.isFinite(amountUi) || amountUi <= 0) return 0;
  if (token === "USDC") return Math.round(amountUi * 1e6);
  return Math.round(amountUi * 1e9);
}

// ─── Gift contents ────────────────────────────────────────────────────────────

export interface GiftContents {
  lamports: number;
  usdcBase: number; // USDC in base units (6 decimals)
}

export async function inspectGift(
  connection: Connection,
  giftPubkey: PublicKey,
  network: Network
): Promise<GiftContents> {
  const ata = getAssociatedTokenAddressSync(usdcMint(network), giftPubkey, false, TOKEN_PROGRAM_ID);
  const [lamports, usdcBase] = await Promise.all([
    connection.getBalance(giftPubkey, "confirmed"),
    connection
      .getTokenAccountBalance(ata, "confirmed")
      .then((r) => Number(r.value.amount))
      .catch(() => 0),
  ]);
  return { lamports, usdcBase };
}

// ─── Funding ──────────────────────────────────────────────────────────────────
// SOL: transfer gift amount + claim fee reserve.
// USDC: ATA + transfer + SOL float for claim costs.

export function buildSolGiftInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountLamports: number
): TransactionInstruction[] {
  return [
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: giftPubkey,
      lamports: amountLamports + CLAIM_FEE_LAMPORTS,
    }),
  ];
}

export function buildUsdcGiftInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number,
  network: Network
): TransactionInstruction[] {
  const mint = usdcMint(network);
  const senderAta = getAssociatedTokenAddressSync(mint, sender, false, TOKEN_PROGRAM_ID);
  const giftAta = getAssociatedTokenAddressSync(mint, giftPubkey, false, TOKEN_PROGRAM_ID);
  return [
    createAssociatedTokenAccountIdempotentInstruction(sender, giftAta, giftPubkey, mint, TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(
      senderAta,
      mint,
      giftAta,
      sender,
      amountBase,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID
    ),
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: giftPubkey,
      lamports: USDC_GIFT_FUND_LAMPORTS,
    }),
  ];
}

/** Build unsigned funding tx (no recentBlockhash — set by caller / API). */
export function buildGiftFundingInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number,
  token: GiftToken,
  network: Network
): TransactionInstruction[] {
  if (token === "USDC") {
    return buildUsdcGiftInstructions(sender, giftPubkey, amountBase, network);
  }
  return buildSolGiftInstructions(sender, giftPubkey, amountBase);
}

// ─── Claim / reclaim sweep ────────────────────────────────────────────────────
// Drains the gift wallet into `destination`. The gift wallet pays its own fee,
// so no other signer is needed — possession of the link is authorization.
// For USDC gifts the recipient's token account is created (paid by the gift
// wallet), the USDC moved, the gift's token account closed (rent refunded to
// the recipient), and any leftover SOL swept too.

export async function sweepGift(
  connection: Connection,
  gift: Keypair,
  destination: PublicKey,
  network: Network
): Promise<{ signature: string; lamports: number; usdcBase: number }> {
  const contents = await inspectGift(connection, gift.publicKey, network);
  const ixs: TransactionInstruction[] = [];

  if (contents.usdcBase > 0) {
    const mint = usdcMint(network);
    const giftAta = getAssociatedTokenAddressSync(mint, gift.publicKey, false, TOKEN_PROGRAM_ID);
    const destAta = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_PROGRAM_ID);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(gift.publicKey, destAta, destination, mint, TOKEN_PROGRAM_ID),
      createTransferCheckedInstruction(giftAta, mint, destAta, gift.publicKey, contents.usdcBase, USDC_DECIMALS, [], TOKEN_PROGRAM_ID),
      createCloseAccountInstruction(giftAta, destination, gift.publicKey, [], TOKEN_PROGRAM_ID)
    );
  }

  const lamports = contents.lamports - CLAIM_FEE_LAMPORTS;
  if (lamports <= 0 && contents.usdcBase <= 0) {
    throw new Error("This gift is empty — it may have already been claimed.");
  }
  if (lamports > 0) {
    ixs.push(SystemProgram.transfer({ fromPubkey: gift.publicKey, toPubkey: destination, lamports }));
  }

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = gift.publicKey;
  tx.sign(gift);

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { signature, lamports: Math.max(lamports, 0), usdcBase: contents.usdcBase };
}

// ─── Sender-side link history (localStorage) ─────────────────────────────────
// The full URL (with secret) is kept only on the sender's device so they can
// re-copy or reclaim an unclaimed gift.

export interface GiftLinkEntry {
  pubkey: string;
  url: string;
  amount: number; // display units (SOL or USDC)
  token?: GiftToken; // absent on pre-USDC entries → SOL
  network: Network;
  createdAt: string;
}

const STORAGE_KEY = "sol.new.giftLinks";

export function loadGiftLinks(): GiftLinkEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveGiftLink(entry: GiftLinkEntry) {
  const links = loadGiftLinks().filter((l) => l.pubkey !== entry.pubkey);
  links.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links.slice(0, 50)));
}

export function removeGiftLink(pubkey: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadGiftLinks().filter((l) => l.pubkey !== pubkey)));
}
