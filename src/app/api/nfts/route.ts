import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssetsByOwner } from "@/lib/helius-das";
import { priceHintsForOwner, sortNftCards, type SortKey } from "@/lib/nft-prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const SORTS = new Set<SortKey>(["recent", "name", "price_asc", "price_desc"]);

/** GET ?owner=&page=&limit=&sort=recent|name|price_asc|price_desc */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "48", 10) || 48;
  const sortRaw = (req.nextUrl.searchParams.get("sort") || "recent").trim() as SortKey;
  const sort: SortKey = SORTS.has(sortRaw) ? sortRaw : "recent";

  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400, headers: noStore });
  }

  try {
    // Price sorts need a wider window so order is meaningful across inventory.
    const fetchLimit =
      sort === "price_asc" || sort === "price_desc" ? Math.min(200, Math.max(limit, 100)) : limit;
    const fetchPage = sort === "price_asc" || sort === "price_desc" ? 1 : page;

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

    items = sortNftCards(items, sort);

    // Client page slice when we widened the fetch for price sort
    let pageItems = items;
    let total = data.total;
    if (sort === "price_asc" || sort === "price_desc") {
      total = items.length;
      const start = (page - 1) * limit;
      pageItems = items.slice(start, start + limit);
    }

    return NextResponse.json(
      {
        ok: true,
        items: pageItems,
        total,
        page,
        limit,
        sort,
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
