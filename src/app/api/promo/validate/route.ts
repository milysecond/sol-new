import { NextRequest, NextResponse } from "next/server";
import { initDb, validatePromoCode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ valid: false });
  await initDb();
  const result = await validatePromoCode(code);
  return NextResponse.json(result);
}
