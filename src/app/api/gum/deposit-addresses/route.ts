import { NextRequest, NextResponse } from "next/server";
import { fetchGumDepositAddresses, isSolanaPubkey } from "@/lib/gum-deposit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dest = (req.nextUrl.searchParams.get("destination") || "").trim();
  if (!isSolanaPubkey(dest)) {
    return NextResponse.json({ ok: false, error: "Invalid Solana address" }, { status: 400 });
  }
  try {
    const data = await fetchGumDepositAddresses(dest);
    const chains = data.chains.filter((c) => c.chainId !== 900);
    return NextResponse.json(
      { ok: true, destination: dest, destinationChainId: 900, chains },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "GUM lookup failed" },
      { status: 502 },
    );
  }
}
