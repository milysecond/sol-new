import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarketRow = {
  id: string;
  title: string;
  ticker: string | null;
  url: string;
  price: string | null;
  volume: string | null;
};

type CacheEntry = {
  at: number;
  markets: MarketRow[];
};

/** Warm-isolate memory cache (survives across requests on same Worker isolate). */
let memCache: CacheEntry | null = null;
const MEM_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 60 * 60_000;

/** Curated open-interest style links if Kalshi is fully unreachable. */
const FALLBACK_MARKETS: MarketRow[] = [
  {
    id: "fallback-fed",
    title: "Browse Fed / rates markets on Kalshi",
    ticker: null,
    url: "https://kalshi.com/category/economics",
    price: null,
    volume: null,
  },
  {
    id: "fallback-politics",
    title: "Browse politics markets on Kalshi",
    ticker: null,
    url: "https://kalshi.com/category/politics",
    price: null,
    volume: null,
  },
  {
    id: "fallback-climate",
    title: "Browse climate & weather on Kalshi",
    ticker: null,
    url: "https://kalshi.com/category/climate-and-weather",
    price: null,
    volume: null,
  },
  {
    id: "fallback-tech",
    title: "Browse companies & tech on Kalshi",
    ticker: null,
    url: "https://kalshi.com/category/companies",
    price: null,
    volume: null,
  },
  {
    id: "fallback-all",
    title: "All open markets on Kalshi",
    ticker: null,
    url: "https://kalshi.com/markets",
    price: null,
    volume: null,
  },
];

function mapMarkets(
  raw: Array<{
    ticker?: string;
    title?: string;
    subtitle?: string;
    yes_bid?: number;
    yes_ask?: number;
    last_price?: number;
    volume_24h?: number;
    volume?: number;
    event_ticker?: string;
  }>,
): MarketRow[] {
  return (raw || []).map((m) => {
    const mid =
      m.yes_bid != null && m.yes_ask != null
        ? (m.yes_bid + m.yes_ask) / 2
        : m.last_price ?? m.yes_bid ?? m.yes_ask;
    const vol = m.volume_24h ?? m.volume;
    // Kalshi prices are 0–100 cents
    const priceNum = mid != null ? Number(mid) : null;
    return {
      id: m.ticker || m.event_ticker || "",
      title: m.title || m.subtitle || m.ticker || "Market",
      ticker: m.ticker || null,
      url: m.ticker
        ? `https://kalshi.com/markets/${encodeURIComponent(m.ticker.toLowerCase())}`
        : "https://kalshi.com/markets",
      price:
        priceNum != null && Number.isFinite(priceNum)
          ? `${Math.round(priceNum)}¢`
          : null,
      volume:
        vol != null && Number.isFinite(Number(vol))
          ? `${Math.round(Number(vol)).toLocaleString()} contracts`
          : null,
    };
  });
}

async function fetchKalshi(limit: number, status: string): Promise<MarketRow[]> {
  const url = new URL("https://api.elections.kalshi.com/trade-api/v2/markets");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("status", status);

  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      // Browser-like UA reduces some bot throttles
      "user-agent":
        "Mozilla/5.0 (compatible; sol.new/1.0; +https://sol.new/punt)",
      "accept-language": "en-US,en;q=0.9",
    },
    // Avoid Next fetch cache weirdness on Workers; we manage our own cache
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Kalshi ${res.status}: ${body.slice(0, 120)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    markets?: Array<{
      ticker?: string;
      title?: string;
      subtitle?: string;
      yes_bid?: number;
      yes_ask?: number;
      last_price?: number;
      volume_24h?: number;
      volume?: number;
      event_ticker?: string;
    }>;
  };

  return mapMarkets(data.markets || []);
}

/**
 * Proxy Kalshi public markets — browser CORS blocks their API; Worker IPs get 429.
 * Memory + Cache-Control so repeats don't hammer upstream.
 * GET /api/punt/kalshi?limit=40
 */
export async function GET(req: NextRequest) {
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "40", 10);
  const limit = Math.min(Math.max(1, limitRaw || 40), 100);
  const status = req.nextUrl.searchParams.get("status") || "open";
  const now = Date.now();

  // Fresh memory hit
  if (memCache && now - memCache.at < MEM_TTL_MS && memCache.markets.length > 0) {
    return NextResponse.json(
      {
        ok: true,
        markets: memCache.markets.slice(0, limit),
        count: Math.min(memCache.markets.length, limit),
        source: "cache",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          "X-Kalshi-Cache": "mem-hit",
        },
      },
    );
  }

  try {
    const markets = await fetchKalshi(limit, status);
    if (markets.length > 0) {
      memCache = { at: now, markets };
    }
    return NextResponse.json(
      {
        ok: true,
        markets,
        count: markets.length,
        source: "live",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
          "X-Kalshi-Cache": "miss",
        },
      },
    );
  } catch (e) {
    const statusCode =
      typeof e === "object" && e && "status" in e
        ? Number((e as { status?: number }).status)
        : 0;
    const msg = e instanceof Error ? e.message : "Kalshi proxy failed";

    // Serve stale memory if we have it
    if (memCache && memCache.markets.length > 0 && now - memCache.at < STALE_TTL_MS) {
      return NextResponse.json(
        {
          ok: true,
          markets: memCache.markets.slice(0, limit),
          count: Math.min(memCache.markets.length, limit),
          source: "stale",
          warning:
            statusCode === 429
              ? "Kalshi rate-limited — showing cached markets"
              : `Kalshi unavailable — showing cached markets`,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
            "X-Kalshi-Cache": "stale",
          },
        },
      );
    }

    // Last resort: curated browse links so UI is never empty
    return NextResponse.json(
      {
        ok: true,
        markets: FALLBACK_MARKETS,
        count: FALLBACK_MARKETS.length,
        source: "fallback",
        warning:
          statusCode === 429
            ? "Kalshi rate-limited this server. Tap a category to browse on Kalshi."
            : `Kalshi feed unavailable (${msg.slice(0, 80)}). Browse on Kalshi:`,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          "X-Kalshi-Cache": "fallback",
        },
      },
    );
  }
}
