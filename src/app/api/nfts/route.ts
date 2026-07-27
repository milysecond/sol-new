import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssetsByOwner } from "@/lib/helius-das";
import {
  priceHintsForOwner,
  sortNftCards,
  filterNftCards,
  filtersActive,
  parseNftFilters,
  collectionFacets,
  type SortKey,
} from "@/lib/nft-prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const SORTS = new Set<SortKey>(["recent", "name", "price_asc", "price_desc"]);

/** GET ?owner=&page=&limit=&sort=&q=&type=&listed=&price=&collection= */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "48", 10) || 48;
  const sortRaw = (req.nextUrl.searchParams.get("sort") || "recent").trim() as SortKey;
  const sort: SortKey = SORTS.has(sortRaw) ? sortRaw : "recent";
  const filters = parseNftFilters(req.nextUrl.searchParams);

  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400, headers: noStore });
  }

  try {
    const needWide =
      filtersActive(filters) || sort === "price_asc" || sort === "price_desc";
    const fetchLimit = needWide ? Math.min(200, Math.max(limit, 100)) : limit;
    const fetchPage = needWide ? 1 : page;

    const data = await getAssetsByOwner({ owner, page: fetchPage, limit: fetchLimit });
    const mints = data.items.map((i) => i.mint);

    let items = data.items;
    try {
      const hints = await priceHintsForOwner(owner, mints);
      items = data.items.map((n) => {
        const h = hints.get(n.mint);
        return {
          ...n,
          priceSol: h?.priceSol ?? null,
          priceSource: h?.priceSource ?? null,
          listed: h?.listed ?? false,
        };
      });
    } catch (e) {
      console.warn("[api/nfts] price enrich failed", e);
      items = data.items.map((n) => ({
        ...n,
        priceSol: null as number | null,
        priceSource: null as "listing" | "floor" | null,
        listed: false,
      }));
    }

    const facets = collectionFacets(items);
    items = filterNftCards(items, filters);
    items = sortNftCards(items, sort);

    let pageItems = items;
    let total = needWide ? items.length : data.total;
    if (needWide) {
      const start = (page - 1) * limit;
      pageItems = items.slice(start, start + limit);
      total = items.length;
    }

    return NextResponse.json(
      {
        ok: true,
        items: pageItems,
        total,
        page,
        limit,
        sort,
        filters,
        collections: facets.slice(0, 40),
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/nfts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load NFTs" },
      { status: 502, headers: noStore },
    );
  }
}
