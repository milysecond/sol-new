import { NextResponse } from "next/server";
import { stonkfunFetch, type StonkPrepareResult } from "@/lib/stonkfun";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prepared = await stonkfunFetch<StonkPrepareResult>("/launches/prepare", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json({ ok: true, ...prepared });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
