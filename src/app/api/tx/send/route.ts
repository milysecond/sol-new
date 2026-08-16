import { NextRequest, NextResponse } from "next/server";
import { sendRawTransactionMainnet, isRateLimitedMessage } from "@/lib/rpc-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/tx/send
 * { transaction: base64 signed tx }
 * Broadcasts via paid mainnet RPC pool with failover (avoids client 402/aex402).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      transaction?: string;
      skipPreflight?: boolean;
    };
    const b64 = body.transaction?.trim();
    if (!b64 || b64.length < 32) {
      return NextResponse.json({ error: "Missing signed transaction" }, { status: 400 });
    }
    // rough size guard (~1.2kb base64 max for solana tx is fine; allow headroom)
    if (b64.length > 5000) {
      return NextResponse.json({ error: "Transaction too large" }, { status: 400 });
    }

    const signature = await sendRawTransactionMainnet(b64, {
      skipPreflight: Boolean(body.skipPreflight),
      maxRetries: 3,
    });

    return NextResponse.json({ ok: true, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = isRateLimitedMessage(msg) ? 503 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: isRateLimitedMessage(msg)
          ? "Network busy — try again in a few seconds"
          : msg,
      },
      { status },
    );
  }
}
