import { NextResponse } from "next/server";
import { stonkfunFetch, unwrapData, type StonkSubmitResult } from "@/lib/stonkfun";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sig: string }> },
) {
  try {
    const { sig } = await params;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(sig)) {
      return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
    }
    const raw = await stonkfunFetch(`/launches/${sig}`);
    const result = unwrapData<StonkSubmitResult>(raw);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
