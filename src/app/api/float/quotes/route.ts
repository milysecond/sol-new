import { NextResponse } from "next/server";
import { loadFloatCatalog } from "@/lib/float/catalog";

export const dynamic = "force-dynamic";

/** Enabled Float quote assets and fee tiers, read from on-chain accounts. */
export async function GET() {
  try {
    const body = await loadFloatCatalog();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't load Float quotes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
