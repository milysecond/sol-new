/**
 * Bridge.xyz API client (server-only).
 * Docs: https://apidocs.bridge.xyz/
 *
 * Env (Worker secrets / .env.local — never commit keys):
 *   BRIDGE_API_KEY            — Api-Key header (sk-live-… prod, sk-test-… sandbox)
 *   BRIDGE_API_BASE           — https://api.bridge.xyz/v0 (prod) or
 *                               https://api.sandbox.bridge.xyz/v0 (sandbox)
 *   BRIDGE_WEBHOOK_PUBLIC_KEY — PEM public key for X-Webhook-Signature (optional)
 *
 * Production Worker: BRIDGE_API_KEY + BRIDGE_API_BASE set via wrangler secret.
 * Local default base is sandbox so a missing base never hits prod by accident.
 */

import crypto from "crypto";

/** Read secret from process.env or Cloudflare Worker bindings (OpenNext). */
function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    // Sync path works inside request handlers after OpenNext injects context.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const ctx = getCloudflareContext();
    const v = ctx?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* not in CF request context */
  }
  return undefined;
}

export const bridgeConfigured = () => Boolean(envVar("BRIDGE_API_KEY"));

export function bridgeBaseUrl(): string {
  return envVar("BRIDGE_API_BASE") || "https://api.sandbox.bridge.xyz/v0";
}

function apiKey(): string {
  const k = envVar("BRIDGE_API_KEY");
  if (!k) throw new Error("BRIDGE_API_KEY not configured");
  return k;
}

export type BridgeJson = Record<string, unknown>;

export async function bridgeFetch<T = BridgeJson>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Api-Key": apiKey(),
    Accept: "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${bridgeBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { raw: text } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

/** Create hosted KYC + ToS links for an individual. */
export async function createKycLink(opts: {
  email: string;
  fullName?: string;
  redirectUri: string;
  idempotencyKey: string;
}) {
  return bridgeFetch(
    "POST",
    "/kyc_links",
    {
      email: opts.email,
      type: "individual",
      full_name: opts.fullName || undefined,
      redirect_uri: opts.redirectUri,
      endorsements: ["base"],
    },
    opts.idempotencyKey,
  );
}

export async function getKycLink(id: string) {
  return bridgeFetch("GET", `/kyc_links/${id}`);
}

export async function getCustomer(customerId: string) {
  return bridgeFetch("GET", `/customers/${customerId}`);
}

/**
 * USD ACH push / wire → USDC on Solana to the user's non-custodial address.
 */
export async function createUsdcOnrampTransfer(opts: {
  customerId: string;
  solanaAddress: string;
  amountUsd?: string;
  flexible?: boolean;
  clientReferenceId?: string;
  idempotencyKey: string;
}) {
  const source: BridgeJson = {
    payment_rail: "ach_push",
    currency: "usd",
  };
  const destination: BridgeJson = {
    payment_rail: "solana",
    currency: "usdc",
    to_address: opts.solanaAddress,
  };
  const body: BridgeJson = {
    on_behalf_of: opts.customerId,
    source,
    destination,
    client_reference_id: opts.clientReferenceId,
  };
  if (opts.flexible || !opts.amountUsd) {
    body.features = { flexible_amount: true };
  } else {
    body.amount = opts.amountUsd;
  }

  return bridgeFetch("POST", "/transfers", body, opts.idempotencyKey);
}

export async function getTransfer(id: string) {
  return bridgeFetch("GET", `/transfers/${id}`);
}

/**
 * Verify Bridge webhook signature (X-Webhook-Signature: t=<ms>,v0=<b64>).
 * Digest = SHA256(timestamp + '.' + rawBody); signature is base64 of ECDSA/RSA over digest.
 * When BRIDGE_WEBHOOK_PUBLIC_KEY is unset, returns false (fail closed in production handlers).
 */
export function verifyBridgeWebhookSignature(
  header: string | null,
  rawBody: string,
): boolean {
  const pem = envVar("BRIDGE_WEBHOOK_PUBLIC_KEY");
  if (!pem || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  ) as Record<string, string>;

  const t = parts.t;
  const v0 = parts.v0;
  if (!t || !v0) return false;

  // Reject stale events (>10 min)
  const age = Math.abs(Date.now() - Number(t));
  if (!Number.isFinite(Number(t)) || age > 10 * 60 * 1000) return false;

  try {
    const digest = crypto.createHash("sha256").update(`${t}.${rawBody}`).digest();
    const signature = Buffer.from(v0, "base64");
    const key = crypto.createPublicKey(pem);
    // Bridge docs: verify with public key + digest + decoded signature
    return crypto.verify(null, digest, key, signature);
  } catch {
    return false;
  }
}
