import { NextResponse } from "next/server";
import { stonkfunFetch, unwrapData } from "@/lib/stonkfun";

export async function GET(req: Request) {
  try {
    const quoteMint = new URL(req.url).searchParams.get("quoteMint") || "";
    if (!quoteMint) return NextResponse.json({ ok: false, error: "quoteMint required" }, { status: 400 });
    const raw = await stonkfunFetch(`/launchlab/pricing?quoteMint=${encodeURIComponent(quoteMint)}`);
    const data = unwrapData<Record<string, unknown>>(raw);
    return NextResponse.json({ ok: true, pricing: data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
