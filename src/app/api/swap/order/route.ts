import { NextRequest, NextResponse } from "next/server";
import { jupUltraConfigured, ultraOrder } from "@/lib/jup-ultra";

export const dynamic = "force-dynamic";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET /api/swap/order?inputMint&outputMint&amount&taker&slippageBps?
 * Proxies Jupiter Ultra order (unsigned tx + requestId).
 */
export async function GET(req: NextRequest) {
  if (!jupUltraConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Swap not configured" },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const inputMint = sp.get("inputMint")?.trim() || "";
  const outputMint = sp.get("outputMint")?.trim() || "";
  const amount = sp.get("amount")?.trim() || "";
  const taker = sp.get("taker")?.trim() || "";
  const slip = sp.get("slippageBps");

  if (!BASE58.test(inputMint) || !BASE58.test(outputMint)) {
    return NextResponse.json({ error: "Invalid mint" }, { status: 400 });
  }
  if (!BASE58.test(taker)) {
    return NextResponse.json({ error: "Invalid taker" }, { status: 400 });
  }
  if (!/^\d+$/.test(amount) || amount === "0") {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (inputMint === outputMint) {
    return NextResponse.json({ error: "Same token" }, { status: 400 });
  }

  try {
    const order = await ultraOrder({
      inputMint,
      outputMint,
      amount,
      taker,
      slippageBps: slip ? Number(slip) : undefined,
    });
    if (order.errorMessage || order.error) {
      return NextResponse.json(
        { ok: false, error: order.errorMessage || order.error },
        { status: 400 }
      );
    }
    if (!order.transaction || !order.requestId) {
      return NextResponse.json(
        { ok: false, error: "No transaction returned — try a larger amount" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, configured: true, order });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
