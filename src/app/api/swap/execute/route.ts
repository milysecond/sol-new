import { NextRequest, NextResponse } from "next/server";
import { jupUltraConfigured, ultraExecute } from "@/lib/jup-ultra";

export const dynamic = "force-dynamic";

/**
 * POST /api/swap/execute
 * Body: { signedTransaction, requestId }
 */
export async function POST(req: NextRequest) {
  if (!jupUltraConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Swap not configured" },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as {
      signedTransaction?: string;
      requestId?: string;
    };
    if (!body.signedTransaction || !body.requestId) {
      return NextResponse.json(
        { error: "signedTransaction and requestId required" },
        { status: 400 }
      );
    }
    const result = await ultraExecute({
      signedTransaction: body.signedTransaction,
      requestId: body.requestId,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
