// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PumpFunSDK } from "pumpdotfun-sdk";

const PUMP_API = "https://client-api-2-74b1891ee9f9.herokuapp.com";

function heliusRpc() {
  const k = process.env.HELIUS_API_KEY;
  return k ? `https://mainnet.helius-rpc.com/?api-key=${k}` : "https://api.mainnet-beta.solana.com";
}

export async function GET(_req: NextRequest, { params }: { params: { mint: string } }) {
  const { mint } = params;
  if (!mint) return NextResponse.json({ error: "Missing mint" }, { status: 400 });

  const connection = new Connection(heliusRpc(), "confirmed");
  const dummyWallet = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signTransaction: async (tx: unknown) => tx,
    signAllTransactions: async (txs: unknown[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
  const sdk = new PumpFunSDK(provider);

  const [pumpData, bondingCurve, dexData] = await Promise.allSettled([
    fetch(`${PUMP_API}/coins/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    }).then((r) => (r.ok ? r.json() : null)),

    sdk.getBondingCurveAccount(new PublicKey(mint), "confirmed"),

    fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(6_000),
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  const pump = pumpData.status === "fulfilled" ? pumpData.value : null;
  const curve = bondingCurve.status === "fulfilled" ? bondingCurve.value : null;
  const dex = dexData.status === "fulfilled" ? dexData.value : null;

  const pairs = (dex as any)?.pairs ?? [];
  const pair = pairs[0] ?? null;

  const curveData = curve
    ? {
        virtualTokenReserves: curve.virtualTokenReserves?.toString() ?? null,
        virtualSolReserves: curve.virtualSolReserves?.toString() ?? null,
        realTokenReserves: curve.realTokenReserves?.toString() ?? null,
        realSolReserves: curve.realSolReserves?.toString() ?? null,
        tokenTotalSupply: curve.tokenTotalSupply?.toString() ?? null,
        complete: curve.complete ?? false,
      }
    : null;

  // Bonding curve progress 0-100 (sol raised toward graduation ~85 SOL)
  let progress = 0;
  if (curveData && !curveData.complete) {
    const realSol = Number(curveData.realSolReserves ?? 0) / 1e9;
    progress = Math.min(100, Math.round((realSol / 85) * 100));
  } else if (curveData?.complete) {
    progress = 100;
  }

  const priceUsd = pair?.priceUsd ? parseFloat(pair.priceUsd) : null;
  const marketCapUsd = pair?.fdv ?? null;
  const volume24h = pair?.volume?.h24 ?? null;

  return NextResponse.json(
    {
      mint,
      name: pump?.name ?? null,
      symbol: pump?.symbol ?? null,
      description: pump?.description ?? null,
      imageUrl: pump?.image_uri ?? null,
      metadataUri: pump?.metadata_uri ?? null,
      twitter: pump?.twitter ?? null,
      telegram: pump?.telegram ?? null,
      website: pump?.website ?? null,
      creator: pump?.creator ?? null,
      createdAt: pump?.created_timestamp ? new Date(pump.created_timestamp).toISOString() : null,
      complete: curveData?.complete ?? false,
      progress,
      priceUsd,
      marketCapUsd,
      volume24h,
      pairAddress: pair?.pairAddress ?? null,
      bondingCurve: curveData,
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
