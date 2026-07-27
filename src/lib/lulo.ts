/**
 * Yield partner API client (server-only).
 *
 * Env:
 *   LULO_API_KEY
 *   LULO_API_BASE (optional, default https://api.lulo.fi/v1)
 *   LULO_REFERRAL_CODE (optional, default YGBVA9 — attributes deposits to us)
 */

const LULO_BASE = process.env.LULO_API_BASE?.trim() || "https://api.lulo.fi/v1";

/** App referral code so deposits count under our account. */
export function luloReferralCode(): string {
  return process.env.LULO_REFERRAL_CODE?.trim() || "YGBVA9";
}

export function luloConfigured(): boolean {
  return Boolean(process.env.LULO_API_KEY?.trim());
}

function apiKey(): string {
  const k = process.env.LULO_API_KEY?.trim();
  if (!k) throw new Error("LULO_API_KEY not configured");
  return k;
}

export type LuloJson = Record<string, unknown>;

export async function luloFetch<T = LuloJson>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": apiKey(),
    "User-Agent": "sol.new/1.0 (+https://sol.new)",
  };
  const res = await fetch(`${LULO_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    method: init?.method || (init?.json !== undefined ? "POST" : "GET"),
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    signal: AbortSignal.timeout(25_000),
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

/** USDC mainnet mint */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

/** Human USD amount → base units (6 decimals). */
export function usdcToBase(amount: string | number): number {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return Math.round(n * 10 ** USDC_DECIMALS);
}

/**
 * Generate Protected deposit tx.
 * Always sends referralCode so the depositor is attributed to us.
 */
export async function luloGenerateDeposit(opts: {
  owner: string;
  mintAddress?: string;
  /** Human USDC amount (e.g. 10 or "10.5") */
  amount: string | number;
}) {
  const base = usdcToBase(opts.amount);
  const referralCode = luloReferralCode();
  const body: Record<string, unknown> = {
    owner: opts.owner,
    mintAddress: opts.mintAddress || USDC_MINT,
    depositType: "protected",
    amount: base,
    protectedAmount: base,
    referralCode,
    // App deep-link style code (same value; some API versions accept either)
    code: referralCode,
  };
  return luloFetch("/generate.transactions.deposit?priorityFee=500000", {
    json: body,
  });
}

export async function luloGenerateWithdraw(opts: {
  owner: string;
  mintAddress?: string;
  amount: string | number;
}) {
  const base = usdcToBase(opts.amount);
  return luloFetch("/generate.transactions.withdraw?priorityFee=500000", {
    json: {
      owner: opts.owner,
      mintAddress: opts.mintAddress || USDC_MINT,
      withdrawType: "protected",
      amount: base,
    },
  });
}

export async function luloGetAccount(owner: string) {
  for (const path of [
    `/account/${encodeURIComponent(owner)}`,
    `/account.get?owner=${encodeURIComponent(owner)}`,
    `/get.account?owner=${encodeURIComponent(owner)}`,
  ]) {
    const res = await luloFetch(path).catch(() => null);
    if (res?.ok) return res;
  }
  return luloFetch(`/account/${encodeURIComponent(owner)}`);
}

export async function luloGetRates() {
  for (const path of ["/rates.getRates", "/rates.get", "/pools", "/get.rates"]) {
    const res = await luloFetch(path).catch(() => null);
    if (res?.ok) return res;
  }
  return luloFetch("/rates.getRates");
}
