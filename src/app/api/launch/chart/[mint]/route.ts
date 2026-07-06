import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { mint: string } }) {
  const { mint } = params;
  const pairAddress = req.nextUrl.searchParams.get("pair");

  // If we have a pair address, fetch OHLCV directly
  const endpoint = pairAddress
    ? `https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}`
    : `https://api.dexscreener.com/latest/dex/tokens/${mint}`;

  try {
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return NextResponse.json({ error: "DexScreener error" }, { status: 502 });
    const data = (await r.json()) as { pairs?: unknown[]; pair?: unknown };
    const pairs = data.pairs ?? (data.pair ? [data.pair] : []);
    return NextResponse.json(
      { ok: true, pairs },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
