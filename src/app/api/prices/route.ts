import { NextRequest, NextResponse } from "next/server";
import { jupConfigured, jupPrices } from "@/lib/jup-portfolio";

export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET /api/prices?ids=mint1,mint2,...
 * Jupiter price/v3 proxy.
 */
export async function GET(req: NextRequest) {
  if (!jupConfigured()) {
    return NextResponse.json({ ok: false, configured: false, prices: {} });
  }
  const raw = req.nextUrl.searchParams.get("ids") || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => BASE58.test(s))
    .slice(0, 80);

  if (!ids.length) {
    return NextResponse.json({ ok: true, prices: {} });
  }

  try {
    const prices = await jupPrices(ids);
    return NextResponse.json(
      { ok: true, prices },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        prices: {},
      },
      { status: 502 }
    );
  }
}
