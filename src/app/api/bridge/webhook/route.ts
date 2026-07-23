import { NextRequest, NextResponse } from "next/server";
import { initDb, saveBridgeTransfer, getBridgeTransfer } from "@/lib/db";
import { verifyBridgeWebhookSignature } from "@/lib/bridge";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bridge webhook endpoint.
 * Configure URL in Bridge dashboard: https://sol.new/api/bridge/webhook
 * Set BRIDGE_WEBHOOK_PUBLIC_KEY for signature verification.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-webhook-signature") || req.headers.get("X-Webhook-Signature");

  const requireSig = Boolean(process.env.BRIDGE_WEBHOOK_PUBLIC_KEY?.trim());
  if (requireSig && !verifyBridgeWebhookSignature(sig, raw)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = String(event.event_category || "");
  const type = String(event.event_type || "");
  const object = (event.event_object || {}) as Record<string, unknown>;
  const objectId = String(event.event_object_id || object.id || "");

  try {
    await initDb();

    if (category === "transfer" && objectId) {
      const state = String(object.state || event.event_object_status || "");
      const local = await getBridgeTransfer(objectId);
      const wallet = local ? String((local as { wallet?: string }).wallet || "") : "";
      const customerId = String(object.on_behalf_of || "");

      if (wallet || customerId) {
        await saveBridgeTransfer({
          transferId: objectId,
          wallet: wallet || "unknown",
          customerId: customerId || "unknown",
          amount: object.amount != null ? String(object.amount) : null,
          state: state || "unknown",
          depositJson: object.source_deposit_instructions
            ? JSON.stringify(object.source_deposit_instructions)
            : null,
        });
      }

      if (state === "payment_processed" || type.includes("status_transitioned")) {
        notifyEvent({
          kind: "bridge_transfer_update",
          title: `Bridge transfer ${state}`,
          fields: {
            transferId: objectId,
            state,
            amount: object.amount != null ? String(object.amount) : undefined,
            wallet: wallet || undefined,
            tx: (object.receipt as { destination_tx_hash?: string } | undefined)
              ?.destination_tx_hash,
          },
        }).catch(() => {});
      }
    }

    if (category === "customer" || category === "kyc_link") {
      notifyEvent({
        kind: "bridge_customer_event",
        title: `Bridge ${category}: ${type}`,
        fields: { objectId, status: String(event.event_object_status || "") },
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[bridge/webhook]", e);
    // Still 200 so Bridge does not infinite-retry on our bugs for unknown shapes
  }

  return NextResponse.json({ ok: true });
}
