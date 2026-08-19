/**
 * MoneyGram Ramps (sandbox / production) — server-only helpers.
 * Secret key never leaves the server.
 *
 * Env:
 *  MONEYGRAM_RAMPS_PUBLIC_KEY / MONEYGRAM_PK
 *  MONEYGRAM_RAMPS_SECRET_KEY / MONEYGRAM_SK
 *  MONEYGRAM_RAMPS_ENV = sandbox | production (auto from key prefix if unset)
 *  MONEYGRAM_RAMPS_MAINNET = 1 to show ramps on mainnet UI when approved
 */

function env(name: string): string | undefined {
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
    /* not in CF request context */
  }
  return undefined;
}

export type MoneyGramEnv = "sandbox" | "production";

export function moneygramConfigured(): boolean {
  return Boolean(env("MONEYGRAM_RAMPS_SECRET_KEY") || env("MONEYGRAM_SK"));
}

export function moneygramPublicKey(): string | undefined {
  return env("MONEYGRAM_RAMPS_PUBLIC_KEY") || env("MONEYGRAM_PK");
}

export function moneygramEnv(): MoneyGramEnv {
  const forced = (env("MONEYGRAM_RAMPS_ENV") || "").toLowerCase();
  if (forced === "production" || forced === "prod" || forced === "live") {
    return "production";
  }
  if (forced === "sandbox" || forced === "test" || forced === "sbox") {
    return "sandbox";
  }
  // Auto-detect from key id
  const sk = env("MONEYGRAM_RAMPS_SECRET_KEY") || env("MONEYGRAM_SK") || "";
  const pk = moneygramPublicKey() || "";
  if (/sbox|sandbox|test/i.test(sk) || /sbox|sandbox|test/i.test(pk)) {
    return "sandbox";
  }
  if (/live|prod/i.test(sk) || /live|prod/i.test(pk)) {
    return "production";
  }
  return "sandbox";
}

/**
 * MoneyGram on mainnet UI — OFF for now (test/sandbox only).
 * Flip via MONEYGRAM_RAMPS_MAINNET=1 + production keys when going live.
 */
export function moneygramMainnetEnabled(): boolean {
  const flag = (env("MONEYGRAM_RAMPS_MAINNET") || "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function moneygramSessionUrl(): string {
  if (moneygramEnv() === "production") {
    return (
      env("MONEYGRAM_RAMPS_SESSION_URL") ||
      "https://api.xramps.moneygram.com/api/v1/sessions"
    );
  }
  return (
    env("MONEYGRAM_RAMPS_SESSION_URL") ||
    "https://playground.xramps.moneygram.com/api/v1/sessions"
  );
}

export function moneygramSdkUrl(): string {
  if (moneygramEnv() === "production") {
    return (
      env("MONEYGRAM_RAMPS_SDK_URL") ||
      "https://api.xramps.moneygram.com/sdk/index.global.js"
    );
  }
  return (
    env("MONEYGRAM_RAMPS_SDK_URL") ||
    "https://playground.xramps.moneygram.com/sdk/index.global.js"
  );
}

export type MoneyGramSession = {
  sessionId: string;
  sessionToken: string;
  widgetUrl: string;
  walletType?: string;
  language?: string;
  env: MoneyGramEnv;
  sdkUrl: string;
  publicKeyPrefix: string;
  mainnetEnabled: boolean;
};

export async function createMoneyGramSession(): Promise<MoneyGramSession> {
  const secret = env("MONEYGRAM_RAMPS_SECRET_KEY") || env("MONEYGRAM_SK");
  if (!secret) throw new Error("MoneyGram secret not configured");

  const res = await fetch(moneygramSessionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": secret,
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    sessionId?: string;
    sessionToken?: string;
    widgetUrl?: string;
    walletType?: string;
    language?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.sessionToken || !data.widgetUrl) {
    throw new Error(
      data.error ||
        data.message ||
        `MoneyGram session failed (${res.status})`,
    );
  }

  const pk = moneygramPublicKey() || "";
  return {
    sessionId: data.sessionId || "",
    sessionToken: data.sessionToken,
    widgetUrl: data.widgetUrl,
    walletType: data.walletType,
    language: data.language,
    env: moneygramEnv(),
    sdkUrl: moneygramSdkUrl(),
    publicKeyPrefix: pk ? `${pk.slice(0, 18)}…` : moneygramEnv(),
    mainnetEnabled: moneygramMainnetEnabled(),
  };
}
