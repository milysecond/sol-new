import { NextResponse } from "next/server";
import { orynthConfigured, orynthQuote } from "@/lib/orynth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!orynthConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Orynth not configured" },
      { status: 503 },
    );
  }
  try {
    const quote = await orynthQuote();
    return NextResponse.json({ ok: true, configured: true, ...quote });
  } catch (e) {
    return NextResponse.json(
      { ok: false, configured: true, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
