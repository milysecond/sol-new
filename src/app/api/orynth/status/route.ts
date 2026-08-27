import { NextRequest, NextResponse } from "next/server";
import { orynthConfigured, orynthStatus } from "@/lib/orynth";

export const dynamic = "force-dynamic";

/** GET /api/orynth/status?launchId= */
export async function GET(req: NextRequest) {
  if (!orynthConfigured()) {
    return NextResponse.json({ error: "Orynth not configured" }, { status: 503 });
  }
  const launchId = req.nextUrl.searchParams.get("launchId")?.trim();
  if (!launchId) {
    return NextResponse.json({ error: "launchId required" }, { status: 400 });
  }
  try {
    const status = await orynthStatus(launchId);
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
