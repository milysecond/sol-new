import { NextResponse } from "next/server";
import { initDb, getStats } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
