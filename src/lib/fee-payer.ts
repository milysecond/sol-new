/**
 * Platform SOL fee payer (server-only).
 * Env: SOL_FEE_PAYER_SECRET | TREASURY_PRIVATE_KEY (bs58 or JSON byte array)
 */
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
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

  const R = SPONSOR_RATE_RULES;
  const ip = opts.clientIp || "no-cf-ip";
  const wallets = [...new Set([...policy.signers, ...policy.ataOwners])].slice(0, 8);
  const rules: RateRule[] = [
    { key: `sponsor:ip:${ip}`, limit: R.perIpHour, windowSec: 3600 },
    { key: `sponsor:ip:${ip}`, limit: R.perIpDay, windowSec: 86_400 },
    { key: "sponsor:global", limit: R.globalHour, windowSec: 3600 },
    ...wallets.flatMap((w) => [
      { key: `sponsor:wallet:${w}`, limit: R.perWalletHour, windowSec: 3600 },
      { key: `sponsor:wallet:${w}`, limit: R.perWalletDay, windowSec: 86_400 },
    ]),
    ...Array.from({ length: policy.ataCreates }, () => ({
      key: "sponsor:global:ata",
      limit: R.globalAtaCreatesDay,
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

  const conn = connectionForNetwork(opts.network);
  const pre = await conn.getBalance(payer.publicKey, "confirmed");
  const sim = await conn.simulateTransaction(vtx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [payer.publicKey.toBase58()] },
  });
  if (sim.value.err) {
    throw new SponsorRejected(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
  }
  const post = sim.value.accounts?.[0]?.lamports;
  if (typeof post !== "number") throw new SponsorRejected("Simulation did not report fee payer balance");
  if (pre - post > maxSpend) throw new SponsorRejected("Transaction spends too much sponsor SOL");

  vtx.sign([payer]);
  const sig = await conn.sendRawTransaction(vtx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, feePayer: payer.publicKey.toBase58() };
}
