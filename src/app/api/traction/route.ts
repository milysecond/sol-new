import { NextRequest, NextResponse } from "next/server";
import { initDb, getTractionReport } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/traction?days=30 — daily UTC activity report */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const days = Number(req.nextUrl.searchParams.get("days") || "30");
    const report = await getTractionReport(days);
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "traction failed" },
      { status: 500 },
    );
  }
}
