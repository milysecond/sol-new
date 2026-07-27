import { NextRequest, NextResponse } from "next/server";
import {
  sanctumConfigured,
  sanctumSwapExecute,
  type SanctumSwapQuote,
} from "@/lib/sanctum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/lst/execute
 * Body: { signedTx: base64, orderResponse: SanctumSwapQuote }
 */
export async function POST(req: NextRequest) {
  if (!sanctumConfigured()) {
    return NextResponse.json({ error: "Sanctum not configured" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as {
      signedTx?: string;
      orderResponse?: SanctumSwapQuote;
    };
    if (!body.signedTx || !body.orderResponse?.swapSrcData) {
      return NextResponse.json(
        { error: "signedTx and orderResponse required" },
        { status: 400 },
      );
    }

    const result = await sanctumSwapExecute(body.signedTx, body.orderResponse);
    return NextResponse.json({ ok: true, signature: result.signature });
  } catch (e) {
    console.error("[api/lst/execute]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sanctum execute failed" },
      { status: 502 },
    );
  }
}
