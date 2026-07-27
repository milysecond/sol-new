import { NextResponse } from "next/server";
import { getPuntMatches, type PuntMatch, type PuntOutcome } from "@/lib/punt-data";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export type { PuntMatch, PuntOutcome };

let lastGood: { updatedAt: number; matches: PuntMatch[] } | null = null;

export async function GET() {
  try {
    await initDb();
    const body = await getPuntMatches();
    lastGood = body;
    return NextResponse.json(body);
  } catch (e) {
    // Serve stale data over an error page if we have it
    if (lastGood) return NextResponse.json(lastGood);
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
