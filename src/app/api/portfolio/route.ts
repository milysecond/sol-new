import { NextRequest, NextResponse } from "next/server";
import { jupConfigured, jupWalletSnapshot } from "@/lib/jup-portfolio";

export const dynamic = "force-dynamic";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * GET /api/portfolio?wallet=<pubkey>
 * Jupiter Ultra holdings + Portfolio positions snapshot.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }
  if (!BASE58_RE.test(wallet)) {
    return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
  }
  if (!jupConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Jupiter API not configured" },
      { status: 503 }
    );
  }

  try {
    const data = await jupWalletSnapshot(wallet);
    return NextResponse.json(
      { ok: true, configured: true, ...data },
      { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, configured: true, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
