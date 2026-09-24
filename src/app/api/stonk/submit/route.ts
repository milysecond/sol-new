import { NextResponse } from "next/server";
import { stonkfunFetch, unwrapData, type StonkSubmitResult } from "@/lib/stonkfun";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = await stonkfunFetch("/launches/submit", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const result = unwrapData<StonkSubmitResult>(raw);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
