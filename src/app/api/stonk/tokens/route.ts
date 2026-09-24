import { NextResponse } from "next/server";
import { extractTokens, stonkfunFetch } from "@/lib/stonkfun";

export async function GET() {
  try {
    const raw = await stonkfunFetch("/tokens?sort=marketCap&pageSize=40");
    const tokens = extractTokens(raw);
    return NextResponse.json({ ok: true, tokens });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
