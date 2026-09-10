import { NextResponse } from "next/server";
import { extractPairs, stonkfunFetch } from "@/lib/stonkfun";

export async function GET() {
  try {
    let raw: unknown;
    try {
      raw = await stonkfunFetch("/pairs?launchable=true&pageSize=100");
    } catch {
      raw = await stonkfunFetch("/pairs?pageSize=100");
    }
    const pairs = extractPairs(raw);
    if (!pairs.length) throw new Error("No pairs in response");
    return NextResponse.json({ ok: true, pairs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
