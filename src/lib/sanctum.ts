/**
 * Sanctum API (Ironforge) — LST metadata, swap order, execute.
 * Docs: https://learn.sanctum.so/docs/for-developers/sanctum-api
 *
 * Key is server-side only (SANCTUM_API_KEY Worker secret). Fallback matches
 * the public NEXT_PUBLIC key used on solanaanz.org/lst.
 */

const SANCTUM_API_BASE = "https://sanctum-api.ironforge.network";

/** Public key already shipped on solanaanz; prefer env when set. */
const FALLBACK_KEY = "01KH924CWGBKHRGGVXDF9CAPY7";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export function sanctumApiKey(): string {
  return (
    process.env.SANCTUM_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SANCTUM_API_KEY?.trim() ||
    FALLBACK_KEY
  );
}

export function sanctumConfigured(): boolean {
  return Boolean(sanctumApiKey());
}

export type SanctumLstStats = {
  slug?: string;
  name?: string;
  symbol?: string;
  mint?: string;
  logoUri?: string;
  decimals?: number;
  tvl?: number | null;
  holders?: number | null;
  solValue?: number | null;
  avgApy?: number | null;
  latestApy?: number | null;
  oneLiner?: string | null;
};

export type SanctumSwapQuote = {
  inp: string;
  out: string;
  mode?: string;
  inpAmt: string;
  outAmt: string;
  swapSrcData: unknown;
  tx?: string;
};

async function sanctumGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ apiKey: sanctumApiKey(), ...params });
  const url = `${SANCTUM_API_BASE}${path}?${q.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sanctum ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** List LST metadata (optionally filtered by mint/symbol path). */
export async function sanctumGetLsts(mintOrSymbol?: string): Promise<SanctumLstStats[]> {
  const path = mintOrSymbol
    ? `/lsts/${encodeURIComponent(mintOrSymbol)}`
    : "/lsts";
  const data = await sanctumGet<{ data?: SanctumLstStats[] }>(path, {});
  return data.data || [];
}

/**
 * Build a swap order. With `signer`, response includes unsigned base64 `tx`.
 * Without signer, quote-only (outAmt etc.).
 */
export async function sanctumSwapOrder(opts: {
  inp: string;
  out: string;
  amt: string;
  mode?: "ExactIn" | "ExactOut";
  signer?: string;
  slippageBps?: number;
}): Promise<SanctumSwapQuote> {
  const params: Record<string, string> = {
    inp: opts.inp,
    out: opts.out,
    amt: opts.amt,
    mode: opts.mode || "ExactIn",
  };
  if (opts.signer) params.signer = opts.signer;
  if (opts.slippageBps != null) params.slippageBps = String(opts.slippageBps);

  return sanctumGet<SanctumSwapQuote>("/swap/token/order", params);
}

/** Submit a user-signed order via Sanctum execute. */
export async function sanctumSwapExecute(
  signedTx: string,
  orderResponse: SanctumSwapQuote,
): Promise<{ signature?: string; error?: string }> {
  const url = `${SANCTUM_API_BASE}/swap/token/execute?apiKey=${encodeURIComponent(sanctumApiKey())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedTx, orderResponse }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    signature?: string;
    error?: { message?: string } | string;
  };
  if (!res.ok) {
    const msg =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || `Sanctum execute ${res.status}`;
    throw new Error(msg);
  }
  return { signature: body.signature };
}

export function solToLamportsStr(sol: number): string {
  return Math.floor(sol * 1e9).toString();
}

export function lamportsToSol(lamports: number | string): number {
  return Number(lamports) / 1e9;
}

export function formatApy(apy: number | null | undefined): string | null {
  if (apy == null || !Number.isFinite(apy)) return null;
  const pct = apy < 1 ? apy * 100 : apy;
  return `${pct.toFixed(2)}%`;
}
