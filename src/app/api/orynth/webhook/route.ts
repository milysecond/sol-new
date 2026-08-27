import { NextRequest, NextResponse } from "next/server";
import { verifyOrynthWebhook } from "@/lib/orynth";
import { notifyEvent } from "@/lib/notify";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/orynth/webhook
 * Orynth → sol.new launch notifications.
 * Verify x-orynth-signature with ORYNTH_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig =
    req.headers.get("x-orynth-signature") ||
    req.headers.get("X-Orynth-Signature");

  const secret = process.env.ORYNTH_WEBHOOK_SECRET?.trim();
  if (secret) {
    if (!verifyOrynthWebhook(raw, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: {
    type?: string;
    launchId?: string;
    externalId?: string;
    mintAddress?: string;
    poolAddress?: string;
    launchSignature?: string;
    name?: string;
    symbol?: string;
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  notifyEvent(
    {
      kind: "orynth_webhook",
      emoji: "📡",
      title: body.type || "Orynth webhook",
      fields: {
        launchId: body.launchId || "",
        mint: body.mintAddress || "",
        pool: body.poolAddress || "",
        sig: body.launchSignature || "",
        externalId: body.externalId || "",
      },
    },
    { req },
  );

  // Best-effort index mint if we have it
  if (body.mintAddress) {
    try {
      await initDb();
      // leave full token row to client register; just acknowledge
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true });
}
