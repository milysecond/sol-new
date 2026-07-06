import { NextRequest, NextResponse } from "next/server";
import { initDb, getComments } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { mint: string } }) {
  await initDb().catch(() => {});
  const { mint } = params;
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const comments = await getComments(mint, 50, before);
  return NextResponse.json({ comments });
}
