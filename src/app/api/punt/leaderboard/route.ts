import { NextResponse } from "next/server";
import { initDb, getPuntLeaderboard } from "@/lib/db";
import { settleDuePicks } from "@/lib/punt-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();
    await settleDuePicks().catch(() => {});
    const rows = await getPuntLeaderboard(20);
    return NextResponse.json({
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        wallet: r.wallet as string,
        points: Number(r.points),
        picks: Number(r.picks),
        wins: Number(r.wins),
        settled: Number(r.settled),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
