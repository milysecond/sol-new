/**
 * Crossmint Token Checkout only (FOMO-style).
 * Buy a specific Solana token with Apple Pay / card → lands in user's wallet.
 *
 * NO stablecoin onramp (USDC fund-wallet). That product is geo-gated and separate.
 *
 * Network routing:
 *   devnet  → staging.crossmint.com  (sk_staging_ / ck_staging_)
 *   mainnet → www.crossmint.com      (sk_production_ / ck_production_)
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

/** Official Crossmint staging memecoin for token-checkout tests */
export const XMEME_STAGING_MINT = "7EivYFyNfgGj8xbUymR7J4LuxUHLKRzpLaERHLvi7Dgu";

export type CrossmintNetwork = "mainnet" | "devnet";

export async function crossmintApiKey(network: CrossmintNetwork): Promise<string | undefined> {
  if (network === "devnet") {
    return (
      (await envVarAsync("CROSSMINT_API_KEY_STAGING")) ||
      (await envVarAsync("CROSSMINT_API_KEY"))
    );
  }
  return (
    (await envVarAsync("CROSSMINT_API_KEY_PRODUCTION")) ||
    (await envVarAsync("CROSSMINT_API_KEY_MAINNET")) ||
    // Only use generic key for mainnet if it looks like production
    (async () => {
      const k = await envVarAsync("CROSSMINT_API_KEY");
      if (k && (k.includes("production") || k.startsWith("sk_production"))) return k;
      // staging key must not hit production API
      if (k && (k.includes("staging") || k.startsWith("sk_staging"))) return undefined;
      return k;
    })()
  );
}

export async function crossmintConfigured(network?: CrossmintNetwork): Promise<boolean> {
  if (network) return Boolean(await crossmintApiKey(network));
  const [d, m] = await Promise.all([
    crossmintApiKey("devnet"),
    crossmintApiKey("mainnet"),
  ]);
  return Boolean(d || m);
}

export function crossmintBaseUrl(network: CrossmintNetwork): string {
  return network === "devnet"
    ? "https://staging.crossmint.com"
    : "https://www.crossmint.com";
}

export function tokenLocator(mintOrLocator: string): string {
  const s = mintOrLocator.trim();
  if (s.includes(":")) return s;
  return `solana:${s}`;
}

export function defaultTokenMint(network: CrossmintNetwork): string | null {
  // Devnet/staging has a known test memecoin. Mainnet requires an explicit mint.
  return network === "devnet" ? XMEME_STAGING_MINT : null;
}

export type CreateTokenCheckoutOpts = {
  wallet: string;
  amountUsd: string;
  /** Mint address or full tokenLocator (solana:Mint...) */
  tokenMint: string;
  network: CrossmintNetwork;
  receiptEmail?: string;
};

export type CrossmintOrderResult = {
  orderId: string;
  clientSecret?: string;
  phase?: string;
  paymentStatus?: string;
  deliveryWallet: string;
  tokenLocator: string;
  network: CrossmintNetwork;
  embedBaseUrl: string;
  raw: Record<string, unknown>;
};

/**
 * Token Checkout order — Apple Pay / card → fungible token to external wallet.
 * Same rails FOMO uses (not Onramp).
 */
export async function createTokenCheckoutOrder(
  opts: CreateTokenCheckoutOpts,
): Promise<CrossmintOrderResult> {
  const key = await crossmintApiKey(opts.network);
  if (!key) {
    throw new Error(
      opts.network === "devnet"
        ? "Crossmint staging key missing (CROSSMINT_API_KEY_STAGING or CROSSMINT_API_KEY)"
        : "Crossmint production key missing (CROSSMINT_API_KEY_PRODUCTION)",
    );
  }

  const amount = String(opts.amountUsd).replace(/[^0-9.]/g, "");
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 1 || n > 5000) {
    throw new Error("Amount must be between $1 and $5000");
  }

  const locator = tokenLocator(opts.tokenMint);
  if (!locator.startsWith("solana:") || locator.length < 40) {
    throw new Error("Invalid Solana token mint / locator");
  }

  // Reject known stablecoin locators — those are Onramp, not Token Checkout
  const mint = locator.slice("solana:".length);
  const STABLES = new Set([
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mainnet
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // USDC devnet
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "So11111111111111111111111111111111111111112", // wSOL — not token-checkout
  ]);
  if (STABLES.has(mint)) {
    throw new Error(
      "Stablecoins/SOL use Crossmint Onramp (removed). Use Token Checkout with a memecoin or app token mint.",
    );
  }

  const base = crossmintBaseUrl(opts.network);
  const email = opts.receiptEmail?.trim().slice(0, 256);

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
      ...(email ? { receiptEmail: email } : {}),
    },
    recipient: {
      walletAddress: opts.wallet,
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

  const clientSecret =
    (typeof data.clientSecret === "string" && data.clientSecret) ||
    (typeof order.clientSecret === "string" && order.clientSecret) ||
    (typeof prep.stripeClientSecret === "string" && prep.stripeClientSecret) ||
    undefined;

  return {
    orderId,
    clientSecret,
    phase: typeof order.phase === "string" ? order.phase : undefined,
    paymentStatus: typeof payment.status === "string" ? payment.status : undefined,
    deliveryWallet: opts.wallet,
    tokenLocator: locator,
    network: opts.network,
    embedBaseUrl: base,
    raw: data as Record<string, unknown>,
  };
}

/** @deprecated use createTokenCheckoutOrder */
export const createCrossmintFundOrder = createTokenCheckoutOrder;
