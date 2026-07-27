import { NextRequest, NextResponse } from "next/server";
import { sanctumConfigured, sanctumSwapOrder, WSOL_MINT } from "@/lib/sanctum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lst/order?inp=&out=&amt=&signer=&mode=
 * Proxies Sanctum /swap/token/order so the API key stays server-side.
 */
export async function GET(req: NextRequest) {
  if (!sanctumConfigured()) {
    return NextResponse.json({ error: "Sanctum not configured" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const inp = sp.get("inp")?.trim() || WSOL_MINT;
  const out = sp.get("out")?.trim();
  const amt = sp.get("amt")?.trim();
  const signer = sp.get("signer")?.trim() || undefined;
  const mode = (sp.get("mode")?.trim() as "ExactIn" | "ExactOut" | null) || "ExactIn";
  const slippageBps = sp.get("slippageBps");

  if (!out || !amt) {
    return NextResponse.json({ error: "out and amt required" }, { status: 400 });
  }
  if (!/^\d+$/.test(amt) || amt === "0") {
    return NextResponse.json({ error: "amt must be positive lamports" }, { status: 400 });
  }

  try {
    const order = await sanctumSwapOrder({
      inp,
      out,
      amt,
      mode,
      signer,
      slippageBps: slippageBps ? Number(slippageBps) : 50,
    });
    return NextResponse.json(order);
  } catch (e) {
    console.error("[api/lst/order]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sanctum order failed" },
      { status: 502 },
    );
  }
}
