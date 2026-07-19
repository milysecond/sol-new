import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const NETWORKS = {
  mainnet: HELIUS_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : "https://api.mainnet-beta.solana.com",
  devnet: HELIUS_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : "https://api.devnet.solana.com",
};

// Squads v4 program id
const SQUADS_V4 = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

async function existsOn(rpcUrl: string, addr: PublicKey): Promise<{ exists: boolean; isV4: boolean }> {
  const conn = new Connection(rpcUrl, "confirmed");
  const info = await conn.getAccountInfo(addr);
  if (!info) return { exists: false, isV4: false };
  return { exists: true, isV4: info.owner.equals(SQUADS_V4) };
}

// POST /api/multisig/verify-network  body: { addresses: string[] }
// Returns:  { results: { [address]: 'mainnet' | 'devnet' | null } }
//   network is the cluster where the account exists; null if neither.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { addresses?: unknown };
    const addresses: string[] = Array.isArray(body?.addresses) ? body.addresses.slice(0, 50) : [];
    const results: Record<string, "mainnet" | "devnet" | null> = {};

    await Promise.all(
      addresses.map(async (raw) => {
        let pk: PublicKey;
        try {
          pk = new PublicKey(raw);
        } catch {
          results[raw] = null;
          return;
        }
        const [main, dev] = await Promise.all([
          existsOn(NETWORKS.mainnet, pk).catch(() => ({ exists: false, isV4: false })),
          existsOn(NETWORKS.devnet, pk).catch(() => ({ exists: false, isV4: false })),
        ]);
        if (main.exists && !dev.exists) results[raw] = "mainnet";
        else if (dev.exists && !main.exists) results[raw] = "devnet";
        else if (main.exists && dev.exists) {
          // Both have accounts at this address — pick the v4 one if there's a tie-breaker
          if (main.isV4 && !dev.isV4) results[raw] = "mainnet";
          else if (dev.isV4 && !main.isV4) results[raw] = "devnet";
          else results[raw] = "mainnet";
        } else results[raw] = null;
      })
    );

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
