import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy Kalshi public markets — browser CORS blocks api.elections.kalshi.com.
 * GET /api/punt/kalshi?limit=40
 */
export async function GET(req: NextRequest) {
  try {
    const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "40", 10);
    const limit = Math.min(Math.max(1, limitRaw || 40), 100);
    const status = req.nextUrl.searchParams.get("status") || "open";

    const url = new URL("https://api.elections.kalshi.com/trade-api/v2/markets");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("status", status);

    const res = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": "sol.new-punt/1.0",
      },
      // Edge/Workers: short cache OK
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Kalshi upstream ${res.status}`,
          detail: body.slice(0, 200),
        },
        { status: 502 },
      );
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
      cursor?: string;
    };

    const markets = (data.markets || []).map((m) => {
      const mid =
        m.yes_bid != null && m.yes_ask != null
          ? (m.yes_bid + m.yes_ask) / 2
          : m.last_price ?? m.yes_bid ?? m.yes_ask;
      const vol = m.volume_24h ?? m.volume;
      return {
        id: m.ticker || m.event_ticker || "",
        title: m.title || m.subtitle || m.ticker || "Market",
        ticker: m.ticker || null,
        url: m.ticker
          ? `https://kalshi.com/markets/${m.ticker.toLowerCase()}`
          : "https://kalshi.com",
        price: mid != null && Number.isFinite(mid) ? `${Math.round(Number(mid))}¢` : null,
        volume:
          vol != null && Number.isFinite(Number(vol))
            ? `${Math.round(Number(vol)).toLocaleString()} contracts`
            : null,
      };
    });

    return NextResponse.json(
      { ok: true, markets, count: markets.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Kalshi proxy failed",
      },
      { status: 500 },
    );
  }
}
