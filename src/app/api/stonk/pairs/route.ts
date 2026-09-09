import { NextResponse } from "next/server";
import { stonkfunFetch, type StonkPair } from "@/lib/stonkfun";

export const runtime = "edge";

export async function GET() {
  try {
    const data = await stonkfunFetch<{ pairs?: StonkPair[] } | StonkPair[]>(
      "/pairs?launchable=true",
    );
    const pairs = Array.isArray(data)
      ? data
      : Array.isArray(data.pairs)
        ? data.pairs
        : [];
    return NextResponse.json({
      ok: true,
      pairs: pairs.map((p) => ({
        mint: p.mint,
        symbol: p.symbol,
        name: p.name || p.symbol,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
