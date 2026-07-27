import { NextRequest, NextResponse } from "next/server";
import { initDb, settleFixturePicks } from "@/lib/db";
import { settleDuePicks, PICK_KEYS, type PickKey } from "@/lib/punt-data";

export const dynamic = "force-dynamic";

// Admin escape hatch: force-settle a fixture if the scores feed misses one,
// or trigger a settlement sweep. Guarded by ADMIN_SECRET.
export async function POST(req: NextRequest) {
  try {
    const { secret, fixtureId, result } = (await req.json()) as {
      secret?: string;
      fixtureId?: number;
      result?: string;
    };
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await initDb();

    if (fixtureId && result) {
      if (!PICK_KEYS.includes(result as PickKey)) {
        return NextResponse.json({ error: "result must be part1|draw|part2" }, { status: 400 });
      }
      await settleFixturePicks(Number(fixtureId), result);
      return NextResponse.json({ ok: true, settled: `fixture ${fixtureId} → ${result}` });
    }

    const settled = await settleDuePicks();
    return NextResponse.json({ ok: true, sweptFixtures: settled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
