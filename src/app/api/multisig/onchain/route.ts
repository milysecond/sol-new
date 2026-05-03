import { NextRequest, NextResponse } from "next/server";

const SQUADS_API = "https://v4-api.squads.so/multisigs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }

  try {
    const res = await fetch(`${SQUADS_API}/${wallet}`, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ multisigs: [] });
    }

    const data = await res.json();

    const multisigs = (Array.isArray(data) ? data : []).map((ms: {
      address: string;
      account: { threshold: number; members: { key: string; permissions: { mask: number } }[] };
      defaultVault: string;
      metadata?: { name?: string; description?: string | null; image?: string | null };
    }) => ({
      address: ms.address,
      threshold: ms.account.threshold,
      memberCount: ms.account.members.length,
      vault: ms.defaultVault,
      name: ms.metadata?.name || null,
      image: ms.metadata?.image || null,
    }));

    return NextResponse.json({ multisigs }, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
