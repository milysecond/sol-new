import { NextResponse } from "next/server";
import { fetchProofNetworkHistory } from "@/lib/proofnetwork";

/** Proxy public ProofNetwork VRF history for the /vrf UI feed. */
export async function GET() {
  try {
    const requests = await fetchProofNetworkHistory(12);
    return NextResponse.json(
      { success: true, requests },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        requests: [],
        error: e instanceof Error ? e.message : "Feed unavailable",
      },
      { status: 502 },
    );
  }
}
