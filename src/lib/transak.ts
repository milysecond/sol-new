/**
 * Transak fiat on-ramp (server helpers).
 *
 * Env:
 *   TRANSAK_API_KEY     — partner API key (required)
 *   TRANSAK_API_SECRET  — optional; enables Create Widget URL session API
 *   TRANSAK_ENV         — "production" (default) | "staging"
 */

function envVar(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
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

export function transakConfigured(): boolean {
  return Boolean(envVar("TRANSAK_API_KEY"));
}

export function transakEnv(): "production" | "staging" {
  const e = (envVar("TRANSAK_ENV") || "production").toLowerCase();
  return e === "staging" || e === "stg" || e === "test" ? "staging" : "production";
}

function widgetHost(): string {
  return transakEnv() === "staging"
    ? "https://global-stg.transak.com"
    : "https://global.transak.com";
}

function gatewayHost(): string {
  return transakEnv() === "staging"
    ? "https://api-gateway-stg.transak.com"
    : "https://api-gateway.transak.com";
}

function refreshHost(): string {
  return transakEnv() === "staging"
    ? "https://api-stg.transak.com"
    : "https://api.transak.com";
}

export type TransakAsset = "SOL" | "USDC";

export type BuildTransakWidgetOpts = {
  wallet: string;
  asset?: TransakAsset;
  /** Fiat amount in selected currency (e.g. 50). */
  fiatAmount?: number;
  /** ISO fiat, default AUD for AU focus; user can change in widget unless locked. */
  fiatCurrency?: string;
  countryCode?: string;
  redirectURL?: string;
  userIp?: string;
};

/**
 * Query-param widget URL (works with partner API key alone).
 * Prefer createWidgetSession when TRANSAK_API_SECRET is set.
 */
export function buildTransakWidgetUrl(opts: BuildTransakWidgetOpts): string {
  const apiKey = envVar("TRANSAK_API_KEY");
  if (!apiKey) throw new Error("TRANSAK_API_KEY not configured");

  const asset: TransakAsset = opts.asset === "USDC" ? "USDC" : "SOL";
  const params = new URLSearchParams();
  params.set("apiKey", apiKey);
  params.set("referrerDomain", "sol.new");
  params.set("productsAvailed", "BUY");
  params.set("cryptoCurrencyCode", asset);
  params.set("network", "solana");
  params.set("walletAddress", opts.wallet);
  params.set("disableWalletAddressForm", "true");
  params.set("themeColor", "7c3aed");
  params.set("defaultPaymentMethod", "apple_pay");
  // Prefer AUD for AU users; widget still offers other methods/currencies.
  params.set("defaultFiatCurrency", opts.fiatCurrency || "AUD");
  // Help Transak surface Apple Pay first on supported devices
  if (opts.countryCode) params.set("countryCode", opts.countryCode);
  // AU default country when AUD selected without explicit code
  if (!opts.countryCode && (opts.fiatCurrency || "AUD").toUpperCase() === "AUD") {
    params.set("countryCode", "AU");
  }
  if (opts.fiatAmount != null && opts.fiatAmount > 0) {
    params.set("defaultFiatAmount", String(Math.round(opts.fiatAmount)));
  }
  if (opts.redirectURL) params.set("redirectURL", opts.redirectURL);

  return `${widgetHost()}/?${params.toString()}`;
}

let cachedAccess: { token: string; exp: number } | null = null;

async function partnerAccessToken(): Promise<string | null> {
  const apiKey = envVar("TRANSAK_API_KEY");
  const secret = envVar("TRANSAK_API_SECRET");
  if (!apiKey || !secret) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.exp > now + 60) return cachedAccess.token;

  const res = await fetch(`${refreshHost()}/partners/api/v2/refresh-token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-secret": secret,
    },
    body: JSON.stringify({ apiKey }),
  });
  const json = (await res.json()) as {
    data?: { accessToken?: string; expiresAt?: number };
    error?: { message?: string };
  };
  if (!res.ok || !json.data?.accessToken) {
    console.error("[transak] refresh-token failed", res.status, json);
    return null;
  }
  cachedAccess = {
    token: json.data.accessToken,
    exp: json.data.expiresAt || now + 7 * 24 * 3600,
  };
  return cachedAccess.token;
}

/**
 * Secure session widget URL when API secret is configured.
 * Falls back to query-param URL if secret missing or session fails.
 */
export async function createTransakWidgetUrl(
  opts: BuildTransakWidgetOpts,
): Promise<{ widgetUrl: string; mode: "session" | "query" }> {
  const apiKey = envVar("TRANSAK_API_KEY");
  if (!apiKey) throw new Error("TRANSAK_API_KEY not configured");

  const access = await partnerAccessToken();
  if (!access) {
    return { widgetUrl: buildTransakWidgetUrl(opts), mode: "query" };
  }

  const asset: TransakAsset = opts.asset === "USDC" ? "USDC" : "SOL";
  const widgetParams: Record<string, string | number | boolean> = {
    apiKey,
    referrerDomain: "sol.new",
    productsAvailed: "BUY",
    cryptoCurrencyCode: asset,
    network: "solana",
    walletAddress: opts.wallet,
    disableWalletAddressForm: true,
    themeColor: "7c3aed",
    defaultPaymentMethod: "apple_pay",
    defaultFiatCurrency: opts.fiatCurrency || "AUD",
  };
  if (opts.countryCode) widgetParams.countryCode = opts.countryCode;
  else if ((opts.fiatCurrency || "AUD").toUpperCase() === "AUD") {
    widgetParams.countryCode = "AU";
  }
  if (opts.fiatAmount != null && opts.fiatAmount > 0) {
    widgetParams.defaultFiatAmount = Math.round(opts.fiatAmount);
  }
  if (opts.redirectURL) widgetParams.redirectURL = opts.redirectURL;

  const res = await fetch(`${gatewayHost()}/api/v2/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "access-token": access,
      "x-api-key": apiKey,
      ...(opts.userIp ? { "x-user-ip": opts.userIp } : {}),
    },
    body: JSON.stringify({ widgetParams }),
  });
  const json = (await res.json()) as {
    data?: { widgetUrl?: string };
    error?: { message?: string };
  };
  if (res.ok && json.data?.widgetUrl) {
    return { widgetUrl: json.data.widgetUrl, mode: "session" };
  }
  console.error("[transak] session failed, falling back to query URL", res.status, json);
  return { widgetUrl: buildTransakWidgetUrl(opts), mode: "query" };
}
