import { NextRequest, NextResponse } from "next/server";
import { jupUltraConfigured, tokenSearch } from "@/lib/jup-ultra";

export const dynamic = "force-dynamic";

/** GET /api/swap/search?q=BONK */
export async function GET(req: NextRequest) {
  if (!jupUltraConfigured()) {
    return NextResponse.json({ ok: false, configured: false, tokens: [] });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 1) {
    return NextResponse.json({ ok: true, tokens: [] });
  }
  try {
    const tokens = await tokenSearch(q);
    return NextResponse.json(
      { ok: true, tokens: tokens.slice(0, 12) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), tokens: [] },
      { status: 502 }
    );
  }
}
