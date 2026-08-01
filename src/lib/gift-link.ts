import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { usdcMint } from "./usdc";
import type { Network } from "./network";

/** "SOL" or an SPL mint address */
export type GiftToken = string;

export const USDC_DECIMALS = 6;
export const WSOL_MINT = NATIVE_MINT.toBase58();

export const CLAIM_FEE_LAMPORTS = 5000;
export const SPL_GIFT_FUND_LAMPORTS = 2_100_000;
/** @deprecated use SPL_GIFT_FUND_LAMPORTS */
export const USDC_GIFT_FUND_LAMPORTS = SPL_GIFT_FUND_LAMPORTS;

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

export function buildGiftUrl(
  secret: string,
  network: Network,
  message?: string,
  origin?: string,
): string {
  const params = new URLSearchParams();
  if (network === "devnet") params.set("n", "d");
  if (message?.trim()) params.set("m", message.trim().slice(0, 80));
  const qs = params.toString();
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  return `${base}/claim${qs ? `?${qs}` : ""}#${secret}`;
}

export function parseGiftSecret(hash: string): string | null {
  const secret = hash.replace(/^#/, "").trim();
  return secret.length > 0 ? secret : null;
}

export type GiftTokenHolding = {
  mint: string;
  amount: bigint;
  decimals: number;
  programId: PublicKey;
};

export interface GiftContents {
  lamports: number;
  usdcBase: number;
  tokens: GiftTokenHolding[];
}

async function loadGiftTokenHoldings(
  connection: Connection,
  giftPubkey: PublicKey,
): Promise<GiftTokenHolding[]> {
  const [spl, t22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(giftPubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(giftPubkey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const out: GiftTokenHolding[] = [];
  for (const { account } of [...spl.value, ...t22.value]) {
    const parsed = account.data.parsed as {
      info?: {
        mint?: string;
        tokenAmount?: { amount?: string; decimals?: number };
      };
    };
    const info = parsed?.info;
    if (!info?.mint || !info.tokenAmount) continue;
    const amount = BigInt(info.tokenAmount.amount || "0");
    if (amount <= BigInt(0)) continue;
    const isT22 = account.owner.equals(TOKEN_2022_PROGRAM_ID);
    out.push({
      mint: info.mint,
      amount,
      decimals: info.tokenAmount.decimals ?? 0,
      programId: isT22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    });
  }
  return out;
}

export async function inspectGift(
  connection: Connection,
  giftPubkey: PublicKey,
  network: Network,
): Promise<GiftContents> {
  const [lamports, tokens] = await Promise.all([
    connection.getBalance(giftPubkey, "confirmed"),
    loadGiftTokenHoldings(connection, giftPubkey),
  ]);
  const usdc = usdcMint(network).toBase58();
  const usdcHold = tokens.find((t) => t.mint === usdc);
  return {
    lamports,
    usdcBase: usdcHold ? Number(usdcHold.amount) : 0,
    tokens,
  };
}

export function buildSplGiftInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  mint: PublicKey,
  amountBase: number | bigint,
  decimals: number,
  programId: PublicKey = TOKEN_PROGRAM_ID,
): TransactionInstruction[] {
  const amount = typeof amountBase === "bigint" ? amountBase : BigInt(Math.trunc(amountBase));
  const senderAta = getAssociatedTokenAddressSync(mint, sender, false, programId);
  const giftAta = getAssociatedTokenAddressSync(mint, giftPubkey, false, programId);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      sender,
      giftAta,
      giftPubkey,
      mint,
      programId,
    ),
    createTransferCheckedInstruction(
      senderAta,
      mint,
      giftAta,
      sender,
      amount,
      decimals,
      [],
      programId,
    ),
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: giftPubkey,
      lamports: SPL_GIFT_FUND_LAMPORTS,
    }),
  ];
}

export function buildUsdcGiftInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number,
  network: Network,
): TransactionInstruction[] {
  return buildSplGiftInstructions(
    sender,
    giftPubkey,
    usdcMint(network),
    amountBase,
    USDC_DECIMALS,
    TOKEN_PROGRAM_ID,
  );
}

/** UI amount → base units for SOL or USDC (legacy API helper). */
export function giftAmountToBase(amountUi: number, token: string): number {
  if (!Number.isFinite(amountUi) || amountUi <= 0) return 0;
  if (token === "USDC") return Math.round(amountUi * 1e6);
  return Math.round(amountUi * 1e9);
}

/**
 * Build funding ixs for SOL or USDC gifts (server-side /api/gift/create).
 * amountBase is lamports (SOL) or USDC base units.
 */
export function buildGiftFundingInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number,
  token: string,
  network: Network,
): TransactionInstruction[] {
  if (token === "USDC") {
    return buildUsdcGiftInstructions(sender, giftPubkey, amountBase, network);
  }
  return [
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: giftPubkey,
      lamports: amountBase + CLAIM_FEE_LAMPORTS,
    }),
  ];
}

export async function sweepGift(
  connection: Connection,
  gift: Keypair,
  destination: PublicKey,
  network: Network,
): Promise<{
  signature: string;
  lamports: number;
  usdcBase: number;
  tokens: GiftTokenHolding[];
}> {
  const contents = await inspectGift(connection, gift.publicKey, network);
  const ixs: TransactionInstruction[] = [];

  for (const t of contents.tokens) {
    const mint = new PublicKey(t.mint);
    const giftAta = getAssociatedTokenAddressSync(mint, gift.publicKey, false, t.programId);
    const destAta = getAssociatedTokenAddressSync(mint, destination, false, t.programId);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        gift.publicKey,
        destAta,
        destination,
        mint,
        t.programId,
      ),
      createTransferCheckedInstruction(
        giftAta,
        mint,
        destAta,
        gift.publicKey,
        t.amount,
        t.decimals,
        [],
        t.programId,
      ),
      createCloseAccountInstruction(giftAta, destination, gift.publicKey, [], t.programId),
    );
  }

  const lamports = contents.lamports - CLAIM_FEE_LAMPORTS;
  if (lamports <= 0 && contents.tokens.length === 0) {
    throw new Error("This gift is empty — it may have already been claimed.");
  }
  if (lamports > 0) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: gift.publicKey,
        toPubkey: destination,
        lamports,
      }),
    );
  }

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = gift.publicKey;
  tx.sign(gift);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return {
    signature,
    lamports: Math.max(lamports, 0),
    usdcBase: contents.usdcBase,
    tokens: contents.tokens,
  };
}

export interface GiftLinkEntry {
  pubkey: string;
  url: string;
  amount: number;
  token?: GiftToken;
  tokenSymbol?: string;
  decimals?: number;
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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(loadGiftLinks().filter((l) => l.pubkey !== pubkey)),
  );
}
