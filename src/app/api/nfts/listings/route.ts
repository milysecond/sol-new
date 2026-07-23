import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssetsByOwner, type NftCard } from "@/lib/helius-das";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export type ListingHint = NftCard & {
  /** Live price when marketplace API is wired; null = deep-link only */
  priceSol: number | null;
  marketplace: "magiceden" | "tensor" | "unknown";
  listingUrl: string;
};

/**
 * GET ?owner=
 * v1: returns owned NFTs with ME + Tensor deep links (list/buy off-platform).
 * When TENSOR_API_KEY / ME keys land, enrich with live listing prices.
 */
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || "";
  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400, headers: noStore });
  }

  try {
    const data = await getAssetsByOwner({ owner, page: 1, limit: 50 });
    const listings: ListingHint[] = data.items.map((n) => ({
      ...n,
      priceSol: null,
      marketplace: "tensor",
      listingUrl: n.tensorUrl,
    }));

    return NextResponse.json(
      {
        ok: true,
        mode: "deep_links",
        note: "Live ME/Tensor prices need marketplace API keys. Deep links work now.",
        items: listings,
        total: listings.length,
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/nfts/listings]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load listings" },
      { status: 502, headers: noStore },
    );
  }
}
