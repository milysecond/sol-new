import { NextRequest, NextResponse } from "next/server";
import {
  getStocksScreener,
  filterStocks,
  sortStocks,
  type StockSort,
} from "@/lib/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" };

const SORTS = new Set<StockSort>([
  "volume",
  "change",
  "premium",
  "liquidity",
  "mcap",
  "name",
  "price",
]);

/** GET ?q=&provider=&sector=&sort=volume&dir=desc&limit=100 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const provider = sp.get("provider")?.trim() || "";
    const sector = sp.get("sector")?.trim() || "";
    const sortRaw = (sp.get("sort") || "volume").trim() as StockSort;
    const sort: StockSort = SORTS.has(sortRaw) ? sortRaw : "volume";
    const dir = sp.get("dir") === "asc" ? "asc" : "desc";
    const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") || "200", 10) || 200));

    const data = await getStocksScreener();
    let items = filterStocks(data.items, { q, provider, sector });
    items = sortStocks(items, sort, dir);
    const total = items.length;
    items = items.slice(0, limit);

    return NextResponse.json(
      {
        ok: true,
        items,
        total,
        providers: data.providers,
        sectors: data.sectors,
        sort,
        dir,
        updatedAt: data.updatedAt,
        source: "stocksonsolana.com",
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/stocks]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load stocks" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
