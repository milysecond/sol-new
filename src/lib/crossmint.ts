/**
 * Crossmint headless checkout — fiat → Solana tokens into user's wallet.
 * FOMO-style: Apple Pay / card → USDC or SOL lands on-chain.
 *
 * Env:
 *   CROSSMINT_API_KEY (server sk_…) — required (Worker secret)
 *   CROSSMINT_CLIENT_KEY / NEXT_PUBLIC_CROSSMINT_CLIENT_KEY (optional ck_…)
 *   CROSSMINT_ENV = staging | production
 */

async function envVarAsync(name: string): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const v = (ctx as { env?: Record<string, unknown> })?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  try {
    // sync fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: Record<string, unknown>;
      };
    };
    const v = getCloudflareContext()?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  return undefined;
}

export const USDC_MAINNET_LOCATOR =
  "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DEVNET_LOCATOR =
  "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const SOL_MAINNET_LOCATOR =
  "solana:So11111111111111111111111111111111111111112";
export const SOL_DEVNET_LOCATOR =
  "solana:So11111111111111111111111111111111111111112";

export type CrossmintAsset = "USDC" | "SOL";

export async function crossmintConfigured(): Promise<boolean> {
  return Boolean(await envVarAsync("CROSSMINT_API_KEY"));
}

export async function crossmintBaseUrl(): Promise<string> {
  const forced = (await envVarAsync("CROSSMINT_ENV"))?.toLowerCase();
  const key = (await envVarAsync("CROSSMINT_API_KEY")) || "";
  if (forced === "staging" || key.includes("staging") || key.startsWith("sk_staging")) {
    return "https://staging.crossmint.com";
  }
  if (
    forced === "production" ||
    key.includes("production") ||
    key.startsWith("sk_production")
  ) {
    return "https://www.crossmint.com";
  }
  return "https://www.crossmint.com";
}

export async function isCrossmintStaging(): Promise<boolean> {
  return (await crossmintBaseUrl()).includes("staging");
}

export async function tokenLocatorFor(
  asset: CrossmintAsset,
  network: "mainnet" | "devnet",
): Promise<string> {
  if (asset === "SOL") {
    return network === "devnet" ? SOL_DEVNET_LOCATOR : SOL_MAINNET_LOCATOR;
  }
  if (await isCrossmintStaging()) return USDC_DEVNET_LOCATOR;
  return network === "devnet" ? USDC_DEVNET_LOCATOR : USDC_MAINNET_LOCATOR;
}

export type CreateFundOrderOpts = {
  wallet: string;
  amountUsd: string;
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
  const key = await envVarAsync("CROSSMINT_API_KEY");
  if (!key) throw new Error("CROSSMINT_API_KEY not configured");

  const amount = String(opts.amountUsd).replace(/[^0-9.]/g, "");
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 1 || n > 5000) {
    throw new Error("Amount must be between $1 and $5000");
  }

  const locator = await tokenLocatorFor(opts.asset, opts.network);
  const base = await crossmintBaseUrl();

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
      method: "card" as const,
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
    paymentStatus: typeof payment.status === "string" ? payment.status : undefined,
    stripePublishableKey:
      (typeof prep.stripePublishableKey === "string" && prep.stripePublishableKey) ||
      undefined,
    checkoutUrl,
    raw: data as Record<string, unknown>,
  };
}

export async function getCrossmintOrder(orderId: string): Promise<Record<string, unknown>> {
  const key = await envVarAsync("CROSSMINT_API_KEY");
  if (!key) throw new Error("CROSSMINT_API_KEY not configured");
  const base = await crossmintBaseUrl();
  const res = await fetch(`${base}/api/2022-06-09/orders/${encodeURIComponent(orderId)}`, {
    headers: { "x-api-key": key, "X-API-KEY": key },
  });
  const data = (await res.json()) as Record<string, unknown> & { message?: string };
  if (!res.ok) throw new Error(data.message || `Get order failed (${res.status})`);
  return data;
}
