/**
 * Platform SOL fee payer (server-only).
 * Env: SOL_FEE_PAYER_SECRET | TREASURY_PRIVATE_KEY (bs58 or JSON byte array)
 */
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { mainnetRpcUrl, rpcUrlFor } from "@/lib/rpc-server";
import { checkSponsoredTransaction } from "@/lib/sponsor-policy";
import { hitRateLimits, type RateRule } from "@/lib/rate-limit";

export function feePayerConfigured(): boolean {
  return Boolean(
    process.env.SOL_FEE_PAYER_SECRET?.trim() ||
      process.env.TREASURY_PRIVATE_KEY?.trim()
  );
}

export function loadFeePayerKeypair(): Keypair {
  const raw =
    process.env.SOL_FEE_PAYER_SECRET?.trim() ||
    process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("SOL_FEE_PAYER_SECRET not configured");
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    const arr = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
}

export function feePayerPubkey(): string {
  return loadFeePayerKeypair().publicKey.toBase58();
}

export function connectionForNetwork(network?: string): Connection {
  const n = network === "devnet" ? "devnet" : "mainnet";
  try {
    return new Connection(rpcUrlFor(n as "mainnet" | "devnet"), "confirmed");
  } catch {
    return new Connection(mainnetRpcUrl(), "confirmed");
  }
}

/** Sponsor-wide rate limits (durable, Turso-backed). */
export const SPONSOR_RATE_RULES = {
  perIpHour: 20,
  perIpDay: 60,
  perWalletHour: 10,
  perWalletDay: 30,
  /** Bounds total exposure even if an attacker rotates IPs and keys. */
  globalHour: 120,
  globalAtaCreatesDay: 200,
} as const;

export class SponsorRejected extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SponsorRejected";
    this.status = status;
  }
}

export type SponsorScope = "sponsor" | "swap" | "stake";

const SCOPE_LIMITS: Record<SponsorScope, { ipHour: number; ipDay: number; walletHour: number; walletDay: number; globalHour: number }> = {
  sponsor: {
    ipHour: SPONSOR_RATE_RULES.perIpHour,
    ipDay: SPONSOR_RATE_RULES.perIpDay,
    walletHour: SPONSOR_RATE_RULES.perWalletHour,
    walletDay: SPONSOR_RATE_RULES.perWalletDay,
    globalHour: SPONSOR_RATE_RULES.globalHour,
  },
  swap: { ipHour: 30, ipDay: 120, walletHour: 20, walletDay: 60, globalHour: 300 },
  stake: { ipHour: 10, ipDay: 30, walletHour: 5, walletDay: 15, globalHour: 100 },
};

/**
 * Durable (Turso) per-IP, per-wallet and global limits for anything the fee payer
 * signs. Throws SponsorRejected(429) when over, SponsorRejected(503) when the DB
 * is unreachable (fail closed).
 */
export async function enforceSponsorLimits(opts: {
  scope: SponsorScope;
  clientIp: string;
  wallets: string[];
  ataCreates?: number;
}): Promise<void> {
  const L = SCOPE_LIMITS[opts.scope];
  const ip = opts.clientIp || "no-cf-ip";
  const wallets = [...new Set(opts.wallets)].slice(0, 8);
  const p = opts.scope;
  const rules: RateRule[] = [
    { key: `${p}:ip:${ip}`, limit: L.ipHour, windowSec: 3600 },
    { key: `${p}:ip:${ip}`, limit: L.ipDay, windowSec: 86_400 },
    { key: `${p}:global`, limit: L.globalHour, windowSec: 3600 },
    ...wallets.flatMap((w) => [
      { key: `${p}:wallet:${w}`, limit: L.walletHour, windowSec: 3600 },
      { key: `${p}:wallet:${w}`, limit: L.walletDay, windowSec: 86_400 },
    ]),
    ...Array.from({ length: opts.ataCreates ?? 0 }, () => ({
      key: "sponsor:global:ata",
      limit: SPONSOR_RATE_RULES.globalAtaCreatesDay,
      windowSec: 86_400,
    })),
  ];
  let over: RateRule | null;
  try {
    over = await hitRateLimits(rules);
  } catch {
    // Fail closed: never spend sponsor SOL when limits can't be enforced.
    throw new SponsorRejected("Sponsorship temporarily unavailable", 503);
  }
  if (over) throw new SponsorRejected("Too many sponsored requests — try again later", 429);
}

/**
 * Simulate (no sig verify) and return how many lamports the fee payer would lose.
 * Throws SponsorRejected if simulation fails or can't report the balance.
 */
export async function simulateFeePayerLoss(
  conn: Connection,
  vtx: VersionedTransaction,
  payer: PublicKey,
): Promise<number> {
  const pre = await conn.getBalance(payer, "confirmed");
  const sim = await conn.simulateTransaction(vtx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [payer.toBase58()] },
  });
  if (sim.value.err) {
    throw new SponsorRejected(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
  }
  const post = sim.value.accounts?.[0]?.lamports;
  if (typeof post !== "number") throw new SponsorRejected("Simulation did not report fee payer balance");
  return pre - post;
}

/**
 * Co-sign a client-built tx where feePayer is our key.
 * Client must already have set feePayer + partial-signed other required signers.
 *
 * Security (audit C2): the tx must pass the instruction allowlist in
 * sponsor-policy.ts (fee payer only ever pays fees / ATA rent), durable per-IP,
 * per-wallet and global rate limits, and a simulation check that the fee payer's
 * balance drops by no more than `maxSpendLamports`.
 */
export async function sponsorAndSend(opts: {
  transactionBase64: string;
  network?: string;
  /** Client IP from cf-connecting-ip (see clientIpFrom). Required for rate limits. */
  clientIp: string;
  /** Max lamports the fee payer may lose in this tx: fees + ATA rent (default 0.015 SOL). */
  maxSpendLamports?: number;
}): Promise<{ signature: string; feePayer: string }> {
  const payer = loadFeePayerKeypair();
  const maxSpend = opts.maxSpendLamports ?? 15_000_000;

  let vtx: VersionedTransaction;
  try {
    // Accepts both legacy and v0 wire formats.
    vtx = VersionedTransaction.deserialize(Buffer.from(opts.transactionBase64, "base64"));
  } catch {
    throw new SponsorRejected("Invalid transaction");
  }

  const policy = checkSponsoredTransaction(vtx, payer.publicKey);
  if (!policy.ok) throw new SponsorRejected(policy.reason);

  await enforceSponsorLimits({
    scope: "sponsor",
    clientIp: opts.clientIp,
    wallets: [...policy.signers, ...policy.ataOwners],
    ataCreates: policy.ataCreates,
  });

  const conn = connectionForNetwork(opts.network);
  const loss = await simulateFeePayerLoss(conn, vtx, payer.publicKey);
  if (loss > maxSpend) throw new SponsorRejected("Transaction spends too much sponsor SOL");

  vtx.sign([payer]);
  const sig = await conn.sendRawTransaction(vtx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, feePayer: payer.publicKey.toBase58() };
}
