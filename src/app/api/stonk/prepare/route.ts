import { NextResponse } from "next/server";
import { stonkfunFetch, unwrapData, type StonkPrepareResult } from "@/lib/stonkfun";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = await stonkfunFetch("/launches/prepare", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const prepared = unwrapData<StonkPrepareResult>(raw);
    return NextResponse.json({ ok: true, ...prepared });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
