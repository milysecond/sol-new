import { NextResponse } from "next/server";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;

const LAMPORT = 1 / 1_000_000_000;

const ACTIONS = [
  { id: "token_launch",     label: "Token launch (Meteora DBC)", sol: 0.03,    note: "rent ≈ 0.025 + platform ≈ 0.005" },
  { id: "nft_standard",     label: "NFT — Standard",             sol: 0.02,    note: "rent ≈ 0.015 + platform 0.005" },
  { id: "nft_compressed",   label: "NFT — Compressed",           sol: 0.001,   note: "platform fee only; Helius covers mint" },
  { id: "multisig_create",  label: "Multisig create (Squads)",   sol: 0.05,    note: "rent ≈ 0.04 + platform 0.01" },
  { id: "tx_fee",           label: "Solana base tx fee",         sol: 5000 * LAMPORT, note: "5000 lamports per signature" },
  { id: "metadata_upload",  label: "Metadata upload",            sol: 0,       note: "Turso — free, $0 onchain" },
  { id: "image_upload",     label: "Image upload",               sol: 0,       note: "Vercel Blob — free, $0 onchain" },
  { id: "wallet_bootstrap", label: "Wallet bootstrap",           sol: 0,       note: "passkey + DB only" },
];

export async function GET() {
  let solUsd: number | null = null;
  let priceSource: string | null = null;
  try {
    const res = await fetch(JUP, { next: { revalidate: 30 } });
    if (res.ok) {
      const data = await res.json();
      const p = data?.[SOL_MINT]?.usdPrice;
      if (typeof p === "number") {
        solUsd = p;
        priceSource = "jupiter";
      }
    }
  } catch {}

  const actions = ACTIONS.map((a) => ({
    ...a,
    usd: solUsd != null ? +(a.sol * solUsd).toFixed(6) : null,
  }));

  return NextResponse.json(
    { solUsd, priceSource, updatedAt: new Date().toISOString(), actions },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}
