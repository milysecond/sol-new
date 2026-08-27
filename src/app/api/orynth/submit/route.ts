import { NextRequest, NextResponse } from "next/server";
import { orynthConfigured, orynthStatus, orynthSubmit } from "@/lib/orynth";
import { notifyEvent } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** POST /api/orynth/submit — broadcast fully signed launch tx */
export async function POST(req: NextRequest) {
  if (!orynthConfigured()) {
    return NextResponse.json({ error: "Orynth not configured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      launchId?: string;
      signedTxHex?: string;
      /** also accept base64 Solana serialize */
      signedTxBase64?: string;
    };
    const launchId = body.launchId?.trim();
    let signedTxHex = body.signedTxHex?.trim();
    if (!signedTxHex && body.signedTxBase64) {
      signedTxHex = Buffer.from(body.signedTxBase64, "base64").toString("hex");
    }
    if (!launchId || !signedTxHex) {
      return NextResponse.json(
        { error: "launchId and signedTxHex required" },
        { status: 400 },
      );
    }

    const result = await orynthSubmit({ launchId, signedTxHex });
    const launch = result.launch || (result as { launch?: unknown }).launch;

    notifyEvent(
      {
        kind: "orynth_launch_submitted",
        emoji: "✅",
        title: "Orynth launch submitted",
        fields: {
          launchId,
          mint:
            (launch as { mintAddress?: string } | undefined)?.mintAddress ||
            "",
          sig:
            (launch as { launchSignature?: string } | undefined)
              ?.launchSignature || "",
        },
      },
      { req },
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("orynth/submit", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** GET /api/orynth/submit?launchId= — poll status (alias) */
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
