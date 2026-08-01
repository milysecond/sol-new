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
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { usdcMint } from "./usdc";
import type { Network } from "./network";
import { NATIVE_SOL_MINT, USDC_MAINNET, USDC_DEVNET } from "./wallet-tokens";

/** "SOL" | "USDC" | mint address */
export type GiftToken = string;
export const USDC_DECIMALS = 6;

export const CLAIM_FEE_LAMPORTS = 5000;

/** SOL float on gift wallet for SPL gifts (ATA rent + fees; rent refunded on close). */
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

export function isNativeGiftToken(token: GiftToken | undefined): boolean {
  return !token || token === "SOL" || token === NATIVE_SOL_MINT;
}

export function isUsdcGiftToken(token: GiftToken | undefined, network: Network = "mainnet"): boolean {
  if (!token || token === "USDC") return token === "USDC";
  const u = usdcMint(network).toBase58();
  return token === u || token === USDC_MAINNET || token === USDC_DEVNET;
}

/** Parse UI amount → base units. */
export function giftAmountToBase(
  amountUi: number,
  token: GiftToken,
  decimals = 9
): number {
  if (!Number.isFinite(amountUi) || amountUi <= 0) return 0;
  if (isNativeGiftToken(token)) return Math.round(amountUi * 1e9);
  if (token === "USDC") return Math.round(amountUi * 1e6);
  const f = 10 ** decimals;
  return Math.round(amountUi * f);
}

export interface GiftTokenHolding {
  mint: string;
  amount: bigint;
  decimals: number;
  programId: PublicKey;
}

export interface GiftContents {
  lamports: number;
  usdcBase: number;
  tokens: GiftTokenHolding[];
}

export async function inspectGift(
  connection: Connection,
  giftPubkey: PublicKey,
  network: Network
): Promise<GiftContents> {
  const lamports = await connection.getBalance(giftPubkey, "confirmed");
  const tokens: GiftTokenHolding[] = [];

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const res = await connection.getParsedTokenAccountsByOwner(giftPubkey, { programId });
      for (const { account } of res.value) {
        const info = account.data.parsed?.info;
        if (!info) continue;
        const mint = info.mint as string;
        const ta = info.tokenAmount as { amount: string; decimals: number };
        const amount = BigInt(ta.amount || "0");
        if (amount <= BigInt(0)) continue;
        tokens.push({
          mint,
          amount,
          decimals: ta.decimals,
          programId,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const usdc = usdcMint(network).toBase58();
  const usdcHold = tokens.find((t) => t.mint === usdc);
  const usdcBase = usdcHold ? Number(usdcHold.amount) : 0;

  return { lamports, usdcBase, tokens };
}

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

export function buildSplGiftInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number | bigint,
  mint: PublicKey,
  decimals: number,
  programId: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction[] {
  const amount = typeof amountBase === "bigint" ? amountBase : BigInt(amountBase);
  const senderAta = getAssociatedTokenAddressSync(mint, sender, false, programId);
  const giftAta = getAssociatedTokenAddressSync(mint, giftPubkey, false, programId);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      sender,
      giftAta,
      giftPubkey,
      mint,
      programId
    ),
    createTransferCheckedInstruction(
      senderAta,
      mint,
      giftAta,
      sender,
      amount,
      decimals,
      [],
      programId
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
  network: Network
): TransactionInstruction[] {
  return buildSplGiftInstructions(
    sender,
    giftPubkey,
    amountBase,
    usdcMint(network),
    USDC_DECIMALS,
    TOKEN_PROGRAM_ID
  );
}

export function buildGiftFundingInstructions(
  sender: PublicKey,
  giftPubkey: PublicKey,
  amountBase: number | bigint,
  token: GiftToken,
  network: Network,
  opts?: { decimals?: number; programId?: string }
): TransactionInstruction[] {
  if (isNativeGiftToken(token)) {
    return buildSolGiftInstructions(sender, giftPubkey, Number(amountBase));
  }
  if (token === "USDC") {
    return buildUsdcGiftInstructions(sender, giftPubkey, Number(amountBase), network);
  }
  const mint = new PublicKey(token);
  const decimals = opts?.decimals ?? 6;
  const programId = opts?.programId
    ? new PublicKey(opts.programId)
    : TOKEN_PROGRAM_ID;
  return buildSplGiftInstructions(
    sender,
    giftPubkey,
    amountBase,
    mint,
    decimals,
    programId
  );
}

export async function sweepGift(
  connection: Connection,
  gift: Keypair,
  destination: PublicKey,
  network: Network,
  opts?: {
    /** When set, sol.new (or other) pays fees + ATA rent; gift still signs transfers */
    feePayer?: PublicKey;
  }
): Promise<{ signature: string; lamports: number; usdcBase: number; sponsored?: boolean }> {
  const contents = await inspectGift(connection, gift.publicKey, network);
  const ixs: TransactionInstruction[] = [];
  const payer = opts?.feePayer || gift.publicKey;
  const sponsored = Boolean(opts?.feePayer);

  for (const t of contents.tokens) {
    const mint = new PublicKey(t.mint);
    const giftAta = getAssociatedTokenAddressSync(
      mint,
      gift.publicKey,
      false,
      t.programId
    );
    const destAta = getAssociatedTokenAddressSync(
      mint,
      destination,
      false,
      t.programId
    );
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        destAta,
        destination,
        mint,
        t.programId
      ),
      createTransferCheckedInstruction(
        giftAta,
        mint,
        destAta,
        gift.publicKey,
        t.amount,
        t.decimals,
        [],
        t.programId
      ),
      createCloseAccountInstruction(
        giftAta,
        destination,
        gift.publicKey,
        [],
        t.programId
      )
    );
  }

  // Leave a fee only when gift pays for itself
  const reserve = sponsored ? 0 : CLAIM_FEE_LAMPORTS;
  const lamports = contents.lamports - reserve;
  if (lamports <= 0 && contents.tokens.length === 0) {
    throw new Error("This gift is empty — it may have already been claimed.");
  }
  if (lamports > 0) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: gift.publicKey,
        toPubkey: destination,
        lamports,
      })
    );
  }

  if (!ixs.length) {
    throw new Error("Nothing to claim");
  }

  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  tx.partialSign(gift);

  if (sponsored) {
    // Return unsigned-by-fee-payer tx for /api/sponsor
    return {
      signature: Buffer.from(
        tx.serialize({ requireAllSignatures: false, verifySignatures: false })
      ).toString("base64"),
      lamports: Math.max(lamports, 0),
      usdcBase: contents.usdcBase,
      sponsored: true,
    };
  }

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return {
    signature,
    lamports: Math.max(lamports, 0),
    usdcBase: contents.usdcBase,
    sponsored: false,
  };
}

export interface GiftLinkEntry {
  pubkey: string;
  url: string;
  amount: number;
  token?: GiftToken;
  symbol?: string;
  /** @deprecated use symbol */
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
    JSON.stringify(loadGiftLinks().filter((l) => l.pubkey !== pubkey))
  );
}

export function giftTokenLabel(token?: GiftToken, symbol?: string): string {
  if (!token || isNativeGiftToken(token)) return "SOL";
  if (token === "USDC") return "USDC";
  return symbol || `${token.slice(0, 4)}…`;
}
