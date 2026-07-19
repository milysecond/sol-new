import { NextRequest, NextResponse } from "next/server";

/**
 * Token search for watchlists — Jupiter Tokens V2 search.
 * GET /api/lists/search?q=bonk
 */

const JUP_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";

export type SearchHit = {
  mint: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  marketCapUsd: number | null;
  priceUsd: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  verified: boolean;
};

type JupTokenRow = {
  id?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  mcap?: number | null;
  fdv?: number | null;
  usdPrice?: number | null;
  liquidity?: number | null;
  stats24h?: { priceChange?: number };
  isVerified?: boolean;
  tags?: string[];
};

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 1) {
      return NextResponse.json({ results: [] as SearchHit[] });
    }
    if (q.length > 80) {
      return NextResponse.json({ error: "Query too long", results: [] }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(`${JUP_SEARCH}?query=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          results: [] as SearchHit[],
          error: `Jupiter search failed (${res.status})${text ? `: ${text.slice(0, 60)}` : ""}`,
        },
        { status: 502 },
      );
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json(
        { results: [] as SearchHit[], error: "Invalid Jupiter response" },
        { status: 502 },
      );
    }

    const rows = Array.isArray(data) ? (data as JupTokenRow[]) : [];
    const results: SearchHit[] = rows
      .filter((t) => typeof t.id === "string" && t.id.length >= 32)
      .slice(0, 20)
      .map((t) => {
        const tags = t.tags ?? [];
        const verified =
          !!t.isVerified ||
          tags.includes("verified") ||
          tags.includes("strict") ||
          tags.includes("community");
        return {
          mint: t.id!,
          name: t.name ?? null,
          symbol: t.symbol ?? null,
          imageUrl: t.icon ?? null,
          marketCapUsd:
            typeof t.mcap === "number" && Number.isFinite(t.mcap)
              ? t.mcap
              : typeof t.fdv === "number" && Number.isFinite(t.fdv)
                ? t.fdv
                : null,
          priceUsd:
            typeof t.usdPrice === "number" && Number.isFinite(t.usdPrice) ? t.usdPrice : null,
          change24h:
            typeof t.stats24h?.priceChange === "number" &&
            Number.isFinite(t.stats24h.priceChange)
              ? t.stats24h.priceChange
              : null,
          liquidityUsd:
            typeof t.liquidity === "number" && Number.isFinite(t.liquidity)
              ? t.liquidity
              : null,
          verified,
        };
      });

    return NextResponse.json(
      { results, query: q },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        results: [] as SearchHit[],
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
