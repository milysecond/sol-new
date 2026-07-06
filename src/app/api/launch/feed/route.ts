import { NextRequest, NextResponse } from "next/server";
import { getRecentTokens } from "@/lib/db";

const PUMP_ENDPOINTS = [
  "https://frontend-api.pump.fun",
  "https://client-api-2-74b1891ee9f9.herokuapp.com",
];

async function fetchPumpFeed(sort: string, limit = 48) {
  for (const base of PUMP_ENDPOINTS) {
    try {
      const url = `${base}/coins?offset=0&limit=${limit}&sort=${sort}&order=DESC&includeNsfw=false`;
      const r = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6_000),
      });
      if (r.ok) return r.json() as Promise<unknown[]>;
    } catch { /* try next */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "new";

  let pumpCoins: unknown[] | null = null;
  try {
    if (tab === "trending") {
      pumpCoins = await fetchPumpFeed("last_trade_timestamp");
    } else if (tab === "graduating") {
      pumpCoins = await fetchPumpFeed("king_of_the_hill_timestamp");
    } else {
      pumpCoins = await fetchPumpFeed("created_timestamp");
    }
  } catch { /* fall through to DB */ }

  // Fall back to our own DB tokens when pump.fun API is unavailable
  if (!pumpCoins) {
    try {
      const result = await getRecentTokens(48, 0, "mainnet");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (result as any).rows ?? result;
      const dbCoins = rows.map((r: any) => ({
        mint: r.mint_address,
        name: r.name,
        symbol: r.symbol,
        description: r.description,
        image_uri: r.image_url,
        created_timestamp: r.created_at,
        source: "sol.new",
      }));
      return NextResponse.json(
        { ok: true, coins: dbCoins, source: "db" },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
      );
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 502 });
    }
  }

  return NextResponse.json(
    { ok: true, coins: pumpCoins, source: "pump.fun" },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
  );
}
