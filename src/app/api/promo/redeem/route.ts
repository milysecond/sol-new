import { NextRequest, NextResponse } from "next/server";
import { initDb, redeemPromoCode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { code, wallet, kind } = (await req.json()) as { code?: string; wallet?: string; kind?: string };
  if (!code || !wallet || !kind) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  await initDb();
  const ok = await redeemPromoCode(code, wallet, kind);
  if (!ok) return NextResponse.json({ error: "Invalid or expired code" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
