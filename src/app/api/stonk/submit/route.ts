import { NextResponse } from "next/server";
import { stonkfunFetch, type StonkSubmitResult } from "@/lib/stonkfun";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await stonkfunFetch<StonkSubmitResult>("/launches/submit", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
