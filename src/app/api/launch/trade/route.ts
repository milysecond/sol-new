// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PumpFunSDK } from "pumpdotfun-sdk";

function heliusRpc() {
  const k = process.env.HELIUS_API_KEY;
  return k ? `https://mainnet.helius-rpc.com/?api-key=${k}` : "https://api.mainnet-beta.solana.com";
}

export async function POST(req: NextRequest) {
  try {
    const { mint, side, amount, slippage = 500, wallet } = await req.json();
    if (!mint || !side || !amount || !wallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (side !== "buy" && side !== "sell") {
      return NextResponse.json({ error: "side must be buy or sell" }, { status: 400 });
    }

    const connection = new Connection(heliusRpc(), "confirmed");
    const user = new PublicKey(wallet);
    const mintPubkey = new PublicKey(mint);

    const dummyWallet = {
      publicKey: user,
      signTransaction: async (tx: unknown) => tx,
      signAllTransactions: async (txs: unknown[]) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    const sdk = new PumpFunSDK(provider);

    const slippageBigInt = BigInt(slippage);

    let tx;
    if (side === "buy") {
      const buyAmountSol = BigInt(Math.round(Number(amount) * 1e9));
      tx = await sdk.getBuyInstructionsBySolAmount(user, mintPubkey, buyAmountSol, slippageBigInt, "confirmed");
    } else {
      const sellTokenAmount = BigInt(String(amount));
      tx = await sdk.getSellInstructionsByTokenAmount(user, mintPubkey, sellTokenAmount, slippageBigInt, "confirmed");
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = user;
    tx.recentBlockhash = blockhash;

    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString("base64");

    return NextResponse.json({ ok: true, tx: serializedTx, blockhash, lastValidBlockHeight });
  } catch (e: unknown) {
    console.error("launch/trade error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
