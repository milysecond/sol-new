/**
 * Lulo API client (server-only).
 * Docs / portal: https://lulo.fi  https://dev.lulo.fi
 *
 * Env: LULO_API_KEY
 */

const LULO_BASE = process.env.LULO_API_BASE?.trim() || "https://api.lulo.fi/v1";

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

export async function luloGenerateDeposit(opts: {
  owner: string;
  mintAddress?: string;
  amount: string | number;
}) {
  return luloFetch("/generate.transactions.deposit", {
    json: {
      owner: opts.owner,
      mintAddress: opts.mintAddress || USDC_MINT,
      amount: String(opts.amount),
    },
  });
}

export async function luloGenerateWithdraw(opts: {
  owner: string;
  mintAddress?: string;
  amount: string | number;
}) {
  return luloFetch("/generate.transactions.withdraw", {
    json: {
      owner: opts.owner,
      mintAddress: opts.mintAddress || USDC_MINT,
      amount: String(opts.amount),
    },
  });
}

/** Best-effort account / APY read — path may vary by Lulo API version. */
export async function luloGetAccount(owner: string) {
  // Try a few known shapes; return first success
  for (const path of [
    `/account.get?owner=${encodeURIComponent(owner)}`,
    `/get.account?owner=${encodeURIComponent(owner)}`,
    `/accounts/${encodeURIComponent(owner)}`,
  ]) {
    const res = await luloFetch(path).catch(() => null);
    if (res?.ok) return res;
  }
  return luloFetch(`/account.get?owner=${encodeURIComponent(owner)}`);
}

export async function luloGetRates() {
  for (const path of ["/rates.get", "/get.rates", "/rates"]) {
    const res = await luloFetch(path).catch(() => null);
    if (res?.ok) return res;
  }
  return luloFetch("/rates.get");
}
