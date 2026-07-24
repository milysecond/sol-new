import { NextRequest, NextResponse } from "next/server";
import { formatApy, sanctumConfigured, sanctumGetLsts } from "@/lib/sanctum";
import { SANCTUM_LSTS } from "@/lib/lsts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lst/meta?mint=optional
 * Curated LST list enriched with Sanctum APY/TVL when available.
 */
export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint")?.trim();

  if (!sanctumConfigured()) {
    return NextResponse.json({
      configured: false,
      lsts: SANCTUM_LSTS,
    });
  }

  try {
    if (mint) {
      const rows = await sanctumGetLsts(mint);
      const row = rows[0];
      return NextResponse.json({
        configured: true,
        lst: row
          ? {
              ...row,
              apyLabel: formatApy(row.latestApy ?? row.avgApy ?? null),
            }
          : null,
      });
    }

    // One list call, then match curated mints (avoids N API hits)
    const all = await sanctumGetLsts();
    const byMint = new Map(
      all
        .filter((r) => r.mint)
        .map((r) => [r.mint as string, r]),
    );
    const enriched = SANCTUM_LSTS.map((c) => {
      const row = byMint.get(c.mint);
      return {
        ...c,
        tvl: row?.tvl ?? null,
        solValue: row?.solValue ?? null,
        latestApy: row?.latestApy ?? null,
        avgApy: row?.avgApy ?? null,
        apyLabel: formatApy(row?.latestApy ?? row?.avgApy ?? null),
        holders: row?.holders ?? null,
      };
    });

    return NextResponse.json({ configured: true, lsts: enriched });
  } catch (e) {
    console.error("[api/lst/meta]", e);
    return NextResponse.json({
      configured: true,
      lsts: SANCTUM_LSTS,
      error: e instanceof Error ? e.message : "meta failed",
    });
  }
}
