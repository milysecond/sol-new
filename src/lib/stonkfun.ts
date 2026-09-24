/** StonkFun public launch API. No key. Wallet signature authorises the fee. */
export const STONKFUN_API = "https://www.stonkfun.xyz/api/public/v1";

export type StonkPair = {
  mint: string;
  symbol: string;
  name?: string;
  launchable?: boolean;
};

export type StonkTokenRow = {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  quoteSymbol?: string;
  mcap?: number | null;
  volume24h?: number | null;
  priceUsd?: number | null;
  change24h?: number | null;
};

type StonkErrorBody = {
  error?: { code?: string; message?: string };
  message?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function extractPairs(raw: unknown): StonkPair[] {
  const rec = asRecord(raw);
  const inner = rec && "data" in rec ? rec.data : raw;
  const innerRec = asRecord(inner);
  const list = Array.isArray(inner)
    ? inner
    : Array.isArray(innerRec?.pairs)
      ? innerRec!.pairs
      : Array.isArray(rec?.pairs)
        ? rec!.pairs
        : [];
  return (list as Record<string, unknown>[])
    .map((p) => ({
      mint: String(p.mint || ""),
      symbol: String(p.symbol || ""),
      name: String(p.name || p.symbol || ""),
      launchable: p.launchable !== false,
    }))
    .filter((p) => p.mint && p.symbol);
}

export function extractTokens(raw: unknown): StonkTokenRow[] {
  const rec = asRecord(raw);
  const inner = rec && "data" in rec ? rec.data : raw;
  const innerRec = asRecord(inner);
  const list = Array.isArray(inner)
    ? inner
    : Array.isArray(innerRec?.tokens)
      ? innerRec!.tokens
      : [];
  return (list as Record<string, unknown>[]).map((t) => {
    const quote = asRecord(t.quote);
    const market = asRecord(t.market);
    const img = String(t.imageUrl || t.logoUrl || "");
    return {
      mint: String(t.mint || ""),
      name: String(t.name || t.symbol || ""),
      symbol: String(t.symbol || ""),
      imageUrl: img.startsWith("http") ? img : undefined,
      quoteSymbol: quote ? String(quote.symbol || "") : undefined,
      mcap: typeof market?.marketCapUsd === "number" ? market.marketCapUsd : null,
      volume24h: typeof market?.volume24hUsd === "number" ? market.volume24hUsd : null,
      priceUsd: typeof market?.priceUsd === "number" ? market.priceUsd : null,
      change24h: typeof market?.priceChange24h === "number" ? market.priceChange24h : null,
    };
  }).filter((t) => t.mint);
}

export async function stonkfunFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${STONKFUN_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "sol.new",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text.slice(0, 240) };
  }
  if (!res.ok) {
    const err = json as StonkErrorBody;
    const msg = err?.error?.message || err?.message || `StonkFun ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export type StonkPrepareResult = {
  paymentTransaction: string;
  signedQuote: string;
  payment?: { lamports?: number | string };
  mint?: string;
};

export type StonkSubmitResult = {
  status?: string;
  mint?: string;
  paymentSignature?: string;
  charged?: boolean;
};

export function unwrapData<T>(raw: unknown): T {
  const rec = asRecord(raw);
  if (rec && "data" in rec) return rec.data as T;
  return raw as T;
}
