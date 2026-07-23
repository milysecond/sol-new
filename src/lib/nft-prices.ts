/**
 * NFT price hints from Magic Eden public API (server-only).
 * Listing price when listed; else collection floor as estimate.
 */

export type PriceHint = {
  priceSol: number | null;
  /** listing = active ME list price; floor = collection floor estimate */
  priceSource: "listing" | "floor" | null;
  listed: boolean;
  meCollection?: string | null;
};

type MeToken = {
  mintAddress?: string;
  listStatus?: string;
  price?: number;
  listPrice?: number;
  collection?: string;
};

type MeStats = {
  floorPrice?: number;
  listedCount?: number;
  symbol?: string;
};

const ME = "https://api-mainnet.magiceden.dev/v2";

async function meGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${ME}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch wallet tokens from ME (paginated, cap 300). */
export async function fetchMeWalletTokens(owner: string): Promise<MeToken[]> {
  const out: MeToken[] = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const batch = await meGet<MeToken[]>(
      `/wallets/${owner}/tokens?offset=${offset}&limit=100&listStatus=both`,
    );
    if (!batch || !Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const floorCache = new Map<string, number | null>();

async function collectionFloorSol(symbol: string): Promise<number | null> {
  if (!symbol) return null;
  if (floorCache.has(symbol)) return floorCache.get(symbol) ?? null;
  const stats = await meGet<MeStats>(`/collections/${encodeURIComponent(symbol)}/stats`);
  // ME floorPrice is often in lamports
  let sol: number | null = null;
  if (stats?.floorPrice != null && Number.isFinite(stats.floorPrice)) {
    const raw = stats.floorPrice;
    sol = raw > 1000 ? raw / 1e9 : raw;
  }
  floorCache.set(symbol, sol);
  return sol;
}

/**
 * Build mint → price hint for an owner's NFTs.
 * Prefers active listing price; falls back to collection floor.
 */
export async function priceHintsForOwner(
  owner: string,
  mints: string[],
): Promise<Map<string, PriceHint>> {
  const map = new Map<string, PriceHint>();
  if (mints.length === 0) return map;

  const want = new Set(mints);
  const tokens = await fetchMeWalletTokens(owner);
  const byMint = new Map<string, MeToken>();
  for (const t of tokens) {
    if (t.mintAddress && want.has(t.mintAddress)) byMint.set(t.mintAddress, t);
  }

  const symbols = new Set<string>();
  for (const t of byMint.values()) {
    if (t.collection) symbols.add(t.collection);
  }

  // Prefetch floors in parallel (bounded)
  const symbolList = [...symbols].slice(0, 40);
  await Promise.all(symbolList.map((s) => collectionFloorSol(s)));

  for (const mint of mints) {
    const t = byMint.get(mint);
    if (!t) {
      map.set(mint, { priceSol: null, priceSource: null, listed: false });
      continue;
    }
    const listed = t.listStatus === "listed";
    const listPx =
      typeof t.price === "number"
        ? t.price
        : typeof t.listPrice === "number"
          ? t.listPrice
          : null;

    if (listed && listPx != null && listPx > 0) {
      map.set(mint, {
        priceSol: listPx,
        priceSource: "listing",
        listed: true,
        meCollection: t.collection || null,
      });
      continue;
    }

    const floor = t.collection ? await collectionFloorSol(t.collection) : null;
    map.set(mint, {
      priceSol: floor,
      priceSource: floor != null ? "floor" : null,
      listed: false,
      meCollection: t.collection || null,
    });
  }

  return map;
}

export type SortKey = "recent" | "name" | "price_asc" | "price_desc";

export function sortNftCards<
  T extends { name: string; priceSol?: number | null; mint: string },
>(items: T[], sort: SortKey): T[] {
  const copy = [...items];
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return copy;
  }
  if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? 1 : -1;
    copy.sort((a, b) => {
      const pa = a.priceSol;
      const pb = b.priceSol;
      const aNull = pa == null || !Number.isFinite(pa);
      const bNull = pb == null || !Number.isFinite(pb);
      if (aNull && bNull) return a.name.localeCompare(b.name);
      if (aNull) return 1; // unpriced last
      if (bNull) return -1;
      if (pa !== pb) return (pa! - pb!) * dir;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }
  // recent = API order
  return copy;
}
