// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

function heliusRpc() {
  return mainnetRpcUrl();
}

export async function POST(req: NextRequest) {
  try {
    const { mintAddress, initialPriceUsdc, secondsPerProposal, creatorWallet } = await req.json();
    if (!mintAddress || !initialPriceUsdc || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { FutarchyClient, AmmMath, MAINNET_USDC, getDaoAddr } = await import("@metadaoproject/futarchy/v0.7");
    const BN = (await import("bn.js")).default;

    const connection = new Connection(heliusRpc(), "confirmed");
    const creator = new PublicKey(creatorWallet);

    const wallet = {
      publicKey: creator,
      async signTransaction(tx: unknown) { return tx; },
      async signAllTransactions(txs: unknown[]) { return txs; },
    };
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    const client = FutarchyClient.createClient({ provider });

    const baseMint = new PublicKey(mintAddress);
    const price = parseFloat(String(initialPriceUsdc));
    const twapInitialObservation = AmmMath.getAmmPrice(price, 9, 6);
    const twapMaxObservationChangePerUpdate = twapInitialObservation.divn(100);

    const params = {
      twapInitialObservation,
      twapMaxObservationChangePerUpdate,
      twapStartDelaySeconds: 0,
      minQuoteFutarchicLiquidity: new BN(10_000_000),
      minBaseFutarchicLiquidity: new BN(1_000_000_000_000),
      baseToStake: new BN(1_000_000_000_000),
      passThresholdBps: 5000,
      secondsPerProposal: Number(secondsPerProposal),
      nonce: new BN(0),
      initialSpendingLimit: null,
      teamSponsoredPassThresholdBps: 5000,
      teamAddress: creator,
    };

    const tx = await client.initializeDaoIx({ baseMint, params, quoteMint: MAINNET_USDC }).transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = creator;
    tx.recentBlockhash = blockhash;

    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString("base64");

    const [dao] = getDaoAddr({ nonce: params.nonce, daoCreator: creator });

    return NextResponse.json({
      ok: true,
      tx: serializedTx,
      dao: dao.toBase58(),
      lastValidBlockHeight,
    });
  } catch (e) {
    console.error("govern/create error", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
