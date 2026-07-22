import { NextRequest, NextResponse } from "next/server";
import { initDb, getVrfDraw } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await initDb();
    const { id } = await ctx.params;
    if (!id || !/^[a-f0-9]{16,32}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid draw id" }, { status: 400 });
    }
    const row = await getVrfDraw(id);
    if (!row) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

    let entries: string[] = [];
    try {
      entries = JSON.parse(String(row.entries_json || "[]")) as string[];
    } catch {
      entries = [];
    }

    return NextResponse.json({
      id: row.id,
      mode: row.mode,
      entries,
      entriesHash: row.entries_hash,
      entryCount: Number(row.entry_count),
      winnerIndex: Number(row.winner_index),
      winner: row.winner,
      seed: row.seed,
      verificationHash: row.verification_hash,
      provider: row.provider,
      slot: row.slot != null ? Number(row.slot) : null,
      blockhash: row.blockhash,
      proofnetworkId: row.proofnetwork_id != null ? Number(row.proofnetwork_id) : null,
      title: row.title,
      createdAt: row.created_at,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
