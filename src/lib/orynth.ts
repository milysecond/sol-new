/**
 * Orynth Partner Launch API client (server-only).
 * Docs: https://www.orynth.dev/docs
 *
 * Env:
 *  ORYNTH_PARTNER_API_KEY
 *  ORYNTH_API_BASE_URL (default https://www.orynth.dev)
 *  ORYNTH_POOL_CREATOR_WALLET
 *  ORYNTH_POOL_CREATOR_SECRET_KEY (bs58) — required to sign as poolCreator
 *  ORYNTH_CLAIM_RECEIVER_WALLET
 *  ORYNTH_WEBHOOK_SECRET
 */

const DEFAULT_BASE = "https://www.orynth.dev";

export function orynthConfigured(): boolean {
  return Boolean(process.env.ORYNTH_PARTNER_API_KEY?.trim());
}

export function orynthCanSign(): boolean {
  return Boolean(process.env.ORYNTH_POOL_CREATOR_SECRET_KEY?.trim());
}

function baseUrl(): string {
  return (
    process.env.ORYNTH_API_BASE_URL?.trim().replace(/\/$/, "") || DEFAULT_BASE
  );
}

function authHeaders(json = false): HeadersInit {
  const key = process.env.ORYNTH_PARTNER_API_KEY?.trim();
  if (!key) throw new Error("ORYNTH_PARTNER_API_KEY not configured");
  const h: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    "User-Agent": "sol.new/1.0 (+https://sol.new)",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function orynthFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(init?.method === "POST" || init?.method === "PUT"),
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err =
      (data as { error?: string; message?: string })?.error ||
      (data as { message?: string })?.message ||
      text.slice(0, 300) ||
      `Orynth ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

export type OrynthQuote = {
  partner?: {
    id?: string;
    name?: string;
    slug?: string;
    poolCreatorWalletAddress?: string;
    claimReceiverWalletAddress?: string;
  };
  launchCost?: {
    requiredSol?: number;
    uploadPriceSol?: number;
    transactionFeeBufferSol?: number;
  };
  fees?: Record<string, unknown>;
  requiredSigners?: Record<string, string>;
};

export async function orynthQuote(): Promise<OrynthQuote> {
  return orynthFetch<OrynthQuote>("/api/v1/launches/quote");
}

export type OrynthPrepareBody = {
  externalId: string;
  payerWalletAddress: string;
  source: {
    platform: string;
    url?: string;
    id?: string;
    type?: string;
    title?: string;
  };
  creator: {
    platform: string;
    platformUserId?: string;
    username?: string;
    displayName?: string;
    profileUrl?: string;
  };
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  websiteUrl?: string;
  twitter?: string;
  telegram?: string;
};

export type OrynthPrepareResult = {
  success?: boolean;
  launch?: {
    id: string;
    status?: string;
    preparedTxHex?: string;
    mintAddress?: string;
    poolAddress?: string;
    requiredSigners?: string[];
    feeConfig?: Record<string, unknown>;
  };
  // some responses may flatten
  id?: string;
  preparedTxHex?: string;
  mintAddress?: string;
  error?: string;
};

export async function orynthPrepare(
  body: OrynthPrepareBody,
): Promise<OrynthPrepareResult> {
  return orynthFetch<OrynthPrepareResult>("/api/v1/launches/prepare", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type OrynthSubmitResult = {
  success?: boolean;
  launch?: {
    id?: string;
    status?: string;
    mintAddress?: string;
    poolAddress?: string;
    launchSignature?: string;
  };
  error?: string;
};

export async function orynthSubmit(body: {
  launchId: string;
  signedTxHex: string;
}): Promise<OrynthSubmitResult> {
  return orynthFetch<OrynthSubmitResult>("/api/v1/launches/submit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function orynthStatus(launchId: string): Promise<Record<string, unknown>> {
  return orynthFetch(`/api/v1/launches/${encodeURIComponent(launchId)}`);
}

/** Sign prepared tx as poolCreator (server-side). Returns hex of partial-signed tx. */
export async function orynthSignAsPoolCreator(
  preparedTxHex: string,
): Promise<{ signedTxHex: string; poolCreator: string }> {
  const secret = process.env.ORYNTH_POOL_CREATOR_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error(
      "ORYNTH_POOL_CREATOR_SECRET_KEY not set — cannot sign as poolCreator",
    );
  }
  const { Keypair, Transaction } = await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;
  let kp: InstanceType<typeof Keypair>;
  try {
    // bs58 secret
    kp = Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    try {
      // JSON byte array
      const arr = JSON.parse(secret) as number[];
      kp = Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch {
      throw new Error("Invalid ORYNTH_POOL_CREATOR_SECRET_KEY format");
    }
  }
  const expected = process.env.ORYNTH_POOL_CREATOR_WALLET?.trim();
  if (expected && kp.publicKey.toBase58() !== expected) {
    throw new Error(
      `Pool creator key mismatch: got ${kp.publicKey.toBase58()}, expected ${expected}`,
    );
  }
  const tx = Transaction.from(Buffer.from(preparedTxHex, "hex"));
  tx.partialSign(kp);
  const signedTxHex = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("hex");
  return { signedTxHex, poolCreator: kp.publicKey.toBase58() };
}

export function verifyOrynthWebhook(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.ORYNTH_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!signatureHeader) return false;
  // HMAC-SHA256 hex of body (Node crypto via nodejs_compat on Workers)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
  const expected = nodeCrypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const got = signatureHeader.replace(/^sha256=/, "").trim();
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length) return false;
    return nodeCrypto.timingSafeEqual(a, b);
  } catch {
    return expected === got;
  }
}
