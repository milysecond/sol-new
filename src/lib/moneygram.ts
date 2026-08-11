/**
 * MoneyGram Ramps (sandbox / production) — server-only helpers.
 * Secret key never leaves the server.
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
  const e = (env("MONEYGRAM_RAMPS_ENV") || "sandbox").toLowerCase();
  return e === "production" || e === "prod" ? "production" : "sandbox";
}

export function moneygramSessionUrl(): string {
  if (moneygramEnv() === "production") {
    return (
      env("MONEYGRAM_RAMPS_SESSION_URL") ||
      "https://api.xramps.moneygram.com/api/v1/sessions"
    );
  }
  return "https://playground.xramps.moneygram.com/api/v1/sessions";
}

export function moneygramSdkUrl(): string {
  if (moneygramEnv() === "production") {
    return (
      env("MONEYGRAM_RAMPS_SDK_URL") ||
      "https://api.xramps.moneygram.com/sdk/index.global.js"
    );
  }
  return "https://playground.xramps.moneygram.com/sdk/index.global.js";
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
};

export async function createMoneyGramSession(): Promise<MoneyGramSession> {
  const secret =
    env("MONEYGRAM_RAMPS_SECRET_KEY") || env("MONEYGRAM_SK");
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
  };
}
