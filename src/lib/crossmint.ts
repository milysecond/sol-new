/**
 * Crossmint headless checkout — fiat → Solana tokens into user's wallet.
 * FOMO-style: Apple Pay / card → USDC or SOL lands on-chain.
 *
 * Env:
 *   CROSSMINT_API_KEY (server sk_…) — required
 *   CROSSMINT_CLIENT_KEY (optional ck_… for embedded UI later)
 *   CROSSMINT_ENV = staging | production (default: inferred from key)
 */
function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: Record<string, unknown>;
      };
    };
    const ctx = getCloudflareContext();
    const v = ctx?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

export const USDC_MAINNET_LOCATOR =
  "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DEVNET_LOCATOR =
  "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
/** Native SOL via wrapped SOL mint (Crossmint fungible locator) */
export const SOL_MAINNET_LOCATOR =
  "solana:So11111111111111111111111111111111111111112";
export const SOL_DEVNET_LOCATOR =
  "solana:So11111111111111111111111111111111111111112";

export type CrossmintAsset = "USDC" | "SOL";

export function crossmintConfigured(): boolean {
  return Boolean(envVar("CROSSMINT_API_KEY"));
}

export function crossmintBaseUrl(): string {
  const forced = envVar("CROSSMINT_ENV")?.toLowerCase();
  const key = envVar("CROSSMINT_API_KEY") || "";
  if (forced === "staging" || key.includes("staging") || key.startsWith("sk_staging")) {
    return "https://staging.crossmint.com";
  }
  if (forced === "production" || key.includes("production") || key.startsWith("sk_production")) {
    return "https://www.crossmint.com";
  }
  // Default production for live keys; staging if unknown
  return key.startsWith("sk_") && !key.includes("staging")
    ? "https://www.crossmint.com"
    : "https://staging.crossmint.com";
}

export function isCrossmintStaging(): boolean {
  return crossmintBaseUrl().includes("staging");
}

export function tokenLocatorFor(
  asset: CrossmintAsset,
  network: "mainnet" | "devnet",
): string {
  if (asset === "SOL") {
    return network === "devnet" ? SOL_DEVNET_LOCATOR : SOL_MAINNET_LOCATOR;
  }
  // Staging always uses devnet USDC mint even if app is on "mainnet" UI
  if (isCrossmintStaging()) return USDC_DEVNET_LOCATOR;
  return network === "devnet" ? USDC_DEVNET_LOCATOR : USDC_MAINNET_LOCATOR;
}

export type CreateFundOrderOpts = {
  wallet: string;
  amountUsd: string; // exact-in fiat USD, e.g. "10"
  asset: CrossmintAsset;
  network: "mainnet" | "devnet";
  receiptEmail?: string;
};

export type CrossmintOrderResult = {
  orderId: string;
  clientSecret?: string;
  phase?: string;
  paymentStatus?: string;
  stripePublishableKey?: string;
  checkoutUrl?: string;
  raw: Record<string, unknown>;
};

export async function createCrossmintFundOrder(
  opts: CreateFundOrderOpts,
): Promise<CrossmintOrderResult> {
  const key = envVar("CROSSMINT_API_KEY");
  if (!key) throw new Error("CROSSMINT_API_KEY not configured");

  const amount = String(opts.amountUsd).replace(/[^0-9.]/g, "");
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 1 || n > 5000) {
    throw new Error("Amount must be between $1 and $5000");
  }

  const locator = tokenLocatorFor(opts.asset, opts.network);
  const base = crossmintBaseUrl();

  const body = {
    lineItems: [
      {
        tokenLocator: locator,
        executionParameters: {
          mode: "exact-in",
          amount: n.toFixed(2),
          maxSlippageBps: "500",
        },
      },
    ],
    payment: {
      method: "card",
      ...(opts.receiptEmail
        ? { receiptEmail: opts.receiptEmail.slice(0, 256) }
        : {}),
    },
    recipient: {
      walletAddress: opts.wallet,
    },
  };

  const res = await fetch(`${base}/api/2022-06-09/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "X-API-KEY": key,
    },
    body: JSON.stringify(body),
  });

  // timeout via AbortController for wider runtime support
  // (replaced AbortSignal.timeout above)

  const data = (await res.json()) as Record<string, unknown> & {
    error?: boolean | string;
    message?: string;
    order?: Record<string, unknown>;
    clientSecret?: string;
  };

  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      `Crossmint order failed (${res.status})`;
    throw new Error(msg);
  }

  const order = (data.order || data) as Record<string, unknown>;
  const orderId = String(order.orderId || order.id || "");
  if (!orderId) {
    throw new Error("Crossmint did not return an order id");
  }

  const payment = (order.payment || {}) as Record<string, unknown>;
  const prep = (payment.preparation || {}) as Record<string, unknown>;

  // Hosted checkout deep link (if Crossmint returns one)
  const checkoutUrl =
    (typeof prep.checkoutUrl === "string" && prep.checkoutUrl) ||
    (typeof payment.checkoutUrl === "string" && payment.checkoutUrl) ||
    (typeof order.checkoutUrl === "string" && order.checkoutUrl) ||
    undefined;

  return {
    orderId,
    clientSecret:
      (typeof data.clientSecret === "string" && data.clientSecret) ||
      (typeof order.clientSecret === "string" && order.clientSecret) ||
      (typeof prep.stripeClientSecret === "string" && prep.stripeClientSecret) ||
      undefined,
    phase: typeof order.phase === "string" ? order.phase : undefined,
    paymentStatus:
      typeof payment.status === "string" ? payment.status : undefined,
    stripePublishableKey:
      (typeof prep.stripePublishableKey === "string" && prep.stripePublishableKey) ||
      undefined,
    checkoutUrl,
    raw: data as Record<string, unknown>,
  };
}

export async function getCrossmintOrder(orderId: string): Promise<Record<string, unknown>> {
  const key = envVar("CROSSMINT_API_KEY");
  if (!key) throw new Error("CROSSMINT_API_KEY not configured");
  const base = crossmintBaseUrl();
  const res = await fetch(`${base}/api/2022-06-09/orders/${encodeURIComponent(orderId)}`, {
    headers: { "x-api-key": key, "X-API-KEY": key },
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as Record<string, unknown> & { message?: string };
  if (!res.ok) throw new Error(data.message || `Get order failed (${res.status})`);
  return data;
}
