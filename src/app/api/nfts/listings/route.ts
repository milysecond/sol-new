import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssetsByOwner, type NftCard } from "@/lib/helius-das";
import {
  priceHintsForOwner,
  sortNftCards,
  filterNftCards,
  parseNftFilters,
  collectionFacets,
  type SortKey,
} from "@/lib/nft-prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const SORTS = new Set<SortKey>(["recent", "name", "price_asc", "price_desc"]);

/** GET ?owner=&sort=&q=&type=&listed=&price=&collection= */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || "";
  const sortRaw = (req.nextUrl.searchParams.get("sort") || "price_desc").trim() as SortKey;
  const sort: SortKey = SORTS.has(sortRaw) ? sortRaw : "price_desc";
  const filters = parseNftFilters(req.nextUrl.searchParams);

  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400, headers: noStore });
  }

  try {
    const data = await getAssetsByOwner({ owner, page: 1, limit: 100 });
    const hints = await priceHintsForOwner(
      owner,
      data.items.map((i) => i.mint),
    );

    let items: (NftCard & {
      priceSol: number | null;
      priceSource: "listing" | "floor" | null;
      listed: boolean;
      listingUrl: string;
      marketplace: string;
    })[] = data.items.map((n) => {
      const h = hints.get(n.mint);
      return {
        ...n,
        priceSol: h?.priceSol ?? null,
        priceSource: h?.priceSource ?? null,
        listed: h?.listed ?? false,
        listingUrl: n.meUrl,
        marketplace: h?.listed ? "magiceden" : "unknown",
      };
    });

    // Markets tab baseline: listed or has floor
    items = items.filter((i) => i.listed || i.priceSol != null);
    const facets = collectionFacets(items);
    items = filterNftCards(items, filters);
    items = sortNftCards(items, sort);

    return NextResponse.json(
      {
        ok: true,
        mode: "me_prices",
        items,
        total: items.length,
        sort,
        filters,
        collections: facets.slice(0, 40),
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/nfts/listings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load listings" },
      { status: 502, headers: noStore },
    );
  }
}
