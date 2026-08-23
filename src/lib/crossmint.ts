/**
 * Crossmint headless checkout — fiat → Solana tokens.
 * USDC to external wallets: create smart wallet (user pubkey = admin), fund that.
 */
async function envVarAsync(name: string): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const v = (ctx as unknown as { env?: Record<string, unknown> })?.env?.[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  try {
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
export const XMEME_STAGING_LOCATOR =
  "solana:7EivYFyNfgGj8xbUymR7J4LuxUHLKRzpLaERHLvi7Dgu";

export type CrossmintAsset = "USDC" | "SOL" | "XMEME";

export async function crossmintConfigured(): Promise<boolean> {
  return Boolean(await envVarAsync("CROSSMINT_API_KEY"));
}

export async function crossmintBaseUrl(): Promise<string> {
  const forced = (await envVarAsync("CROSSMINT_ENV"))?.toLowerCase();
  const key = (await envVarAsync("CROSSMINT_API_KEY")) || "";
  if (forced === "staging" || key.includes("staging") || key.startsWith("sk_staging")) {
    return "https://staging.crossmint.com";
  }
  return "https://www.crossmint.com";
}

export async function isCrossmintStaging(): Promise<boolean> {
  return (await crossmintBaseUrl()).includes("staging");
}

export async function tokenLocatorFor(asset: CrossmintAsset): Promise<string> {
  const staging = await isCrossmintStaging();
  if (asset === "XMEME") return XMEME_STAGING_LOCATOR;
  if (asset === "SOL") {
    throw new Error("Native SOL buy is not supported by Crossmint yet — use USDC");
  }
  return staging ? USDC_DEVNET_LOCATOR : USDC_MAINNET_LOCATOR;
}

export async function ensureSmartWalletForExternal(
  userWallet: string,
): Promise<{ address: string }> {
  const key = await envVarAsync("CROSSMINT_API_KEY");
  if (!key) throw new Error("CROSSMINT_API_KEY not configured");
  const base = await crossmintBaseUrl();

  const res = await fetch(`${base}/api/2025-06-09/wallets`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key.trim(),
    },
    body: JSON.stringify({
      chainType: "solana",
      type: "smart",
      owner: `userId:solnew-${userWallet.slice(0, 20)}`,
      config: {
        adminSigner: {
          type: "external-wallet",
          address: userWallet,
        },
      },
    }),
  });

  const data = (await res.json()) as {
    address?: string;
    message?: string;
  };

  if (!res.ok || !data.address) {
    throw new Error(data.message || `Create smart wallet failed (${res.status})`);
  }
  return { address: data.address };
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
  deliveryWallet: string;
  adminWallet: string;
  usedSmartWallet: boolean;
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

  const locator = await tokenLocatorFor(opts.asset);
  const base = await crossmintBaseUrl();

  let deliveryWallet = opts.wallet;
  let usedSmartWallet = false;

  // USDC needs smart wallet for external (passkey) recipients
  if (opts.asset === "USDC") {
    const sw = await ensureSmartWalletForExternal(opts.wallet);
    deliveryWallet = sw.address;
    usedSmartWallet = true;
  }

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
      walletAddress: deliveryWallet,
    },
  };

  const res = await fetch(`${base}/api/2022-06-09/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key.trim(),
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
  if (!orderId) throw new Error("Crossmint did not return an order id");

  const payment = (order.payment || {}) as Record<string, unknown>;
  const prep = (payment.preparation || {}) as Record<string, unknown>;

  return {
    orderId,
    clientSecret:
      (typeof data.clientSecret === "string" && data.clientSecret) ||
      (typeof order.clientSecret === "string" && order.clientSecret) ||
      (typeof prep.stripeClientSecret === "string" && prep.stripeClientSecret) ||
      undefined,
    phase: typeof order.phase === "string" ? order.phase : undefined,
    paymentStatus: typeof payment.status === "string" ? payment.status : undefined,
    deliveryWallet,
    adminWallet: opts.wallet,
    usedSmartWallet,
    raw: data as Record<string, unknown>,
  };
}
