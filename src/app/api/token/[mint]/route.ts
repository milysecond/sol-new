import { NextRequest, NextResponse } from "next/server";
import { getTokenByMint } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const token = await getTokenByMint(mint);
  if (!token) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  return NextResponse.json(token);
}
