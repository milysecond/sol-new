import { NextRequest, NextResponse } from "next/server";
import {
  createMoneyGramSession,
  moneygramConfigured,
  moneygramEnv,
} from "@/lib/moneygram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/moneygram/session
 * Server-only MoneyGram Ramps session (secret never to client).
 */
export async function POST(_req: NextRequest) {
  if (!moneygramConfigured()) {
    return NextResponse.json(
      { error: "MoneyGram Ramps not configured" },
      { status: 503 },
    );
  }

  try {
    const session = await createMoneyGramSession();
    // Never return secret. Session token + widget URL only.
    return NextResponse.json({
      ok: true,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      widgetUrl: session.widgetUrl,
      sdkUrl: session.sdkUrl,
      env: session.env,
      publicKeyHint: session.publicKeyPrefix,
    });
  } catch (e) {
    console.error("[moneygram session]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Session failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: moneygramConfigured(),
    env: moneygramEnv(),
  });
}
