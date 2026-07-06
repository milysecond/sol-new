// @ts-nocheck
import { NextResponse } from "next/server";

const MAINNET_RPC = process.env.NEXT_PUBLIC_RPC_MAINNET || "https://api.mainnet-beta.solana.com";

export const runtime = "nodejs";

function getTime(condition: { __kind: string; time?: bigint }): number {
  if (condition.__kind === "TimeAbsolute" && condition.time !== undefined) {
    return Number(condition.time);
  }
  return 0;
}

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  try {
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
    const {
      genesis,
      fetchGenesisAccountV2,
      findGenesisAccountV2Pda,
      findLaunchPoolBucketV2Pda,
      findUnlockedBucketV2Pda,
      safeFetchLaunchPoolBucketV2,
      safeFetchUnlockedBucketV2,
    } = await import("@metaplex-foundation/genesis");
    const { mplTokenMetadata } = await import("@metaplex-foundation/mpl-token-metadata");
    const { publicKey } = await import("@metaplex-foundation/umi");

    const umi = createUmi(MAINNET_RPC).use(genesis()).use(mplTokenMetadata());
    const mintPk = publicKey(mint);
    const [genesisAccountPda] = findGenesisAccountV2Pda(umi, { baseMint: mintPk, genesisIndex: 0 });

    let account;
    try {
      account = await fetchGenesisAccountV2(umi, genesisAccountPda);
    } catch {
      return NextResponse.json({ error: "Genesis account not found" }, { status: 404 });
    }

    const [unlockedBucketPda] = findUnlockedBucketV2Pda(umi, { genesisAccount: genesisAccountPda, bucketIndex: 0 });
    const [launchPoolBucketPda] = findLaunchPoolBucketV2Pda(umi, { genesisAccount: genesisAccountPda, bucketIndex: 1 });

    const launchPoolBucket = await safeFetchLaunchPoolBucketV2(umi, launchPoolBucketPda).catch(() => null);
    await safeFetchUnlockedBucketV2(umi, unlockedBucketPda).catch(() => null);

    const nowSecs = Math.floor(Date.now() / 1000);
    let phase = "unknown";

    if (launchPoolBucket) {
      const depositStart = getTime(launchPoolBucket.depositStartCondition);
      const depositEnd = getTime(launchPoolBucket.depositEndCondition);
      const claimStart = getTime(launchPoolBucket.claimStartCondition);
      const claimEnd = getTime(launchPoolBucket.claimEndCondition);

      if (nowSecs < depositStart) phase = "upcoming";
      else if (nowSecs < depositEnd) phase = "depositing";
      else if (nowSecs < claimStart) phase = "transitioning";
      else if (nowSecs < claimEnd) phase = "claiming";
      else phase = "ended";

      return NextResponse.json({
        ok: true,
        genesisAccount: genesisAccountPda.toString(),
        launchPoolBucket: launchPoolBucketPda.toString(),
        unlockedBucket: unlockedBucketPda.toString(),
        phase,
        finalized: account.finalized,
        totalSupply: account.totalSupplyBaseToken.toString(),
        quoteTokenDepositTotal: launchPoolBucket.quoteTokenDepositTotal.toString(),
        tokenAllocation: launchPoolBucket.bucket.baseTokenAllocation.toString(),
        depositStartTs: depositStart,
        depositEndTs: depositEnd,
        claimStartTs: claimStart,
        claimEndTs: claimEnd,
      });
    }

    return NextResponse.json({
      ok: true,
      genesisAccount: genesisAccountPda.toString(),
      phase,
      finalized: account.finalized,
      totalSupply: account.totalSupplyBaseToken.toString(),
    });
  } catch (e) {
    console.error("genesis/state error", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
