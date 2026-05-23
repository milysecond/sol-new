import { NextRequest, NextResponse } from "next/server";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP_QUOTE = "https://quote-api.jup.ag/v6/quote";

export async function POST(req: NextRequest) {
  try {
    const { usdcAmount } = await req.json();
    if (!usdcAmount || Number(usdcAmount) <= 0) {
      return NextResponse.json({ error: "Missing usdcAmount" }, { status: 400 });
    }

    // Leave 5% USDC as buffer + cover ATA rent etc; convert 95% to SOL.
    const swapAmount = Math.floor(Number(usdcAmount) * 0.95 * 1_000_000); // 6 decimals
    if (swapAmount < 100_000) {
      return NextResponse.json({ error: "USDC amount too small" }, { status: 400 });
    }

    const params = new URLSearchParams({
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      amount: String(swapAmount),
      slippageBps: "100",
      onlyDirectRoutes: "false",
      swapMode: "ExactIn",
    });

    const res = await fetch(`${JUP_QUOTE}?${params.toString()}`);
    const quote = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: quote?.error || "Jupiter quote failed" }, { status: res.status });
    }

    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
