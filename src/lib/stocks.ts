/**
 * Tokenized stock data via stocksonsolana.com public APIs
 * (same source used by https://stocksonsolana.com).
 */

const SOS = "https://stocksonsolana.com";

export type StockToken = {
  mint: string;
  symbol: string;
  name: string;
  provider: string;
  sector: string;
};

export type StockPrice = {
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  stockPrice: number;
  mcap: number;
};

export type StockRow = StockToken & {
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  stockPrice: number | null;
  mcap: number | null;
  /** (on-chain price - traditional stock price) / stock price * 100 */
  premiumPct: number | null;
  jupUrl: string;
  solscanUrl: string;
};

async function sosFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SOS}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "sol.new/1.0 (+https://sol.new)",
    },
    // Prices move fast; short client cache is on the API route response headers.
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`stocksonsolana ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchStockList(): Promise<StockToken[]> {
  const list = await sosFetch<StockToken[]>("/api/token-list");
  return Array.isArray(list) ? list : [];
}

export async function fetchStockPrices(): Promise<Record<string, StockPrice>> {
  const prices = await sosFetch<Record<string, StockPrice>>("/api/prices");
  return prices && typeof prices === "object" ? prices : {};
}

export function mergeStocks(
  tokens: StockToken[],
  prices: Record<string, StockPrice>,
): StockRow[] {
  return tokens.map((t) => {
    const p = prices[t.mint];
    const price = p?.price ?? null;
    const stockPrice = p?.stockPrice ?? null;
    let premiumPct: number | null = null;
    if (
      price != null &&
      stockPrice != null &&
      Number.isFinite(price) &&
      Number.isFinite(stockPrice) &&
      stockPrice > 0
    ) {
      premiumPct = ((price - stockPrice) / stockPrice) * 100;
    }
    return {
      ...t,
      price,
      change24h: p?.change24h ?? null,
      volume24h: p?.volume24h ?? null,
      liquidity: p?.liquidity ?? null,
      stockPrice,
      mcap: p?.mcap ?? null,
      premiumPct,
      jupUrl: `https://jup.ag/tokens/${t.mint}?ref=yfgv2ibxy07v`,
      solscanUrl: `https://solscan.io/token/${t.mint}`,
    };
  });
}

export async function getStocksScreener(): Promise<{
  items: StockRow[];
  providers: string[];
  sectors: string[];
  updatedAt: string;
}> {
  const [tokens, prices] = await Promise.all([fetchStockList(), fetchStockPrices()]);
  const items = mergeStocks(tokens, prices);
  const providers = [...new Set(items.map((i) => i.provider).filter(Boolean))].sort();
  const sectors = [...new Set(items.map((i) => i.sector).filter(Boolean))].sort();
  return {
    items,
    providers,
    sectors,
    updatedAt: new Date().toISOString(),
  };
}

export type StockSort =
  | "volume"
  | "change"
  | "premium"
  | "liquidity"
  | "mcap"
  | "name"
  | "price";

export function sortStocks(items: StockRow[], sort: StockSort, dir: "asc" | "desc"): StockRow[] {
  const mult = dir === "asc" ? 1 : -1;
  const copy = [...items];
  const num = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? null : v;

  copy.sort((a, b) => {
    if (sort === "name") {
      return mult * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    const map: Record<Exclude<StockSort, "name">, number | null> = {
      volume: num(a.volume24h),
      change: num(a.change24h),
      premium: num(a.premiumPct),
      liquidity: num(a.liquidity),
      mcap: num(a.mcap),
      price: num(a.price),
    };
    const mapB: Record<Exclude<StockSort, "name">, number | null> = {
      volume: num(b.volume24h),
      change: num(b.change24h),
      premium: num(b.premiumPct),
      liquidity: num(b.liquidity),
      mcap: num(b.mcap),
      price: num(b.price),
    };
    const key = sort as Exclude<StockSort, "name">;
    const av = map[key];
    const bv = mapB[key];
    if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return (av - bv) * mult;
    return a.symbol.localeCompare(b.symbol);
  });
  return copy;
}

export function filterStocks(
  items: StockRow[],
  opts: { q?: string; provider?: string; sector?: string },
): StockRow[] {
  const q = (opts.q || "").trim().toLowerCase();
  return items.filter((i) => {
    if (opts.provider && i.provider !== opts.provider) return false;
    if (opts.sector && i.sector !== opts.sector) return false;
    if (q) {
      const hay = `${i.name} ${i.symbol} ${i.mint} ${i.provider} ${i.sector}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
