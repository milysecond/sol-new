/**
 * Jupiter Ultra swap helpers (server-only).
 * Env: JUP_API_KEY
 * Docs: https://dev.jup.ag/docs/guides/how-to-build-a-swap-with-ultra
 */

const JUP_API = "https://api.jup.ag";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jupApiKey(): string | null {
  return process.env.JUP_API_KEY?.trim() || process.env.JUPITER_API_KEY?.trim() || null;
}

export function jupUltraConfigured(): boolean {
  return Boolean(jupApiKey());
}

function headers(json = false): HeadersInit {
  const key = jupApiKey();
  if (!key) throw new Error("JUP_API_KEY not configured");
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "sol.new/1.0 (+https://sol.new)",
    "x-api-key": key,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export type UltraOrder = {
  requestId?: string;
  transaction?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string;
  routePlan?: unknown[];
  errorCode?: number | string;
  errorMessage?: string;
  error?: string;
  [k: string]: unknown;
};

export type TokenHit = {
  id: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  mcap?: number;
  usdPrice?: number;
};

export async function ultraOrder(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker: string;
  slippageBps?: number;
}): Promise<UltraOrder> {
  const q = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    taker: params.taker,
  });
  if (params.slippageBps != null) q.set("slippageBps", String(params.slippageBps));

  const res = await fetch(`${JUP_API}/ultra/v1/order?${q}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as UltraOrder;
  if (!res.ok) {
    throw new Error(data.errorMessage || data.error || `Ultra order ${res.status}`);
  }
  return data;
}

export async function ultraExecute(body: {
  signedTransaction: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${JUP_API}/ultra/v1/execute`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (data.errorMessage as string) ||
        (data.error as string) ||
        `Ultra execute ${res.status}`
    );
  }
  return data;
}

export async function tokenSearch(query: string): Promise<TokenHit[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await fetch(
    `${JUP_API}/tokens/v2/search?query=${encodeURIComponent(q)}`,
    {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    }
  );
  if (!res.ok) throw new Error(`Token search ${res.status}`);
  const data = (await res.json()) as TokenHit[] | { data?: TokenHit[] };
  if (Array.isArray(data)) return data;
  return Array.isArray(data.data) ? data.data : [];
}
