import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssetsByOwner } from "@/lib/helius-das";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET ?owner=&page=&limit= — on-chain NFTs via Helius DAS */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "48", 10) || 48;

  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400, headers: noStore });
  }

  try {
    const data = await getAssetsByOwner({ owner, page, limit });
    return NextResponse.json({ ok: true, ...data }, { headers: noStore });
  } catch (e) {
    console.error("[api/nfts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load NFTs" },
      { status: 502, headers: noStore },
    );
  }
}
