import { NextRequest, NextResponse } from "next/server";
import {
  analyzeWallet,
  walletPnlSummary,
  walletHoldings,
  isValidWallet,
  TopLedgerError,
} from "@/lib/topledger";

// GET /api/track?wallet=<base58>
// Aggregates TopLedger's wallet analysis, PnL summary and token holdings into a
// single payload for the /track page. The TopLedger API key stays server-side.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }
  if (!isValidWallet(wallet)) {
    return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
  }

  try {
    // Holdings can 404 / error for empty wallets without invalidating the whole
    // view, so tolerate its failure independently.
    const [analyze, pnl, holdings] = await Promise.all([
      analyzeWallet(wallet),
      walletPnlSummary(wallet).catch(() => null),
      walletHoldings(wallet).catch(() => null),
    ]);

    return NextResponse.json({ wallet, analyze, pnl, holdings });
  } catch (e) {
    if (e instanceof TopLedgerError) {
      const status = e.status === 404 ? 404 : e.status >= 500 ? 502 : e.status;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
