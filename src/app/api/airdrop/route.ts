import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { notifyEvent } from "@/lib/notify";
import { devnetRpcUrl } from "@/lib/rpc-server";

const AIRDROP_AMOUNT = 0.1 * LAMPORTS_PER_SOL;

function getFaucetKeypair(): Keypair {
  const raw = process.env.FAUCET_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("FAUCET_PRIVATE_KEY not configured");
  let key: number[];
  try {
    key = JSON.parse(raw) as number[];
  } catch {
    throw new Error("FAUCET_PRIVATE_KEY invalid JSON");
  }
  if (!Array.isArray(key) || key.length < 32) {
    throw new Error("FAUCET_PRIVATE_KEY must be a secret key byte array");
  }
  return Keypair.fromSecretKey(new Uint8Array(key));
}

function devnetConnection(): Connection {
  // Prefer Helius / DEVNET_RPC — public api.devnet often 403s from Workers
  const url =
    process.env.DEVNET_RPC?.trim() ||
    devnetRpcUrl() ||
    "https://api.devnet.solana.com";
  return new Connection(url, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

export async function GET() {
  try {
    const faucet = getFaucetKeypair();
    const conn = devnetConnection();
    const balance = await conn.getBalance(faucet.publicKey, "confirmed");
    return NextResponse.json({
      ok: true,
      address: faucet.publicKey.toBase58(),
      balance: balance / LAMPORTS_PER_SOL,
      rpc: (process.env.DEVNET_RPC || "helius-or-default").replace(
        /api-key=[^&]+/i,
        "api-key=***",
      ),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        address: null,
        balance: null,
      },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address } = (await req.json()) as { address?: string };
    if (!address) {
      return NextResponse.json({ ok: false, error: "Missing address" }, { status: 400 });
    }

    let recipient: PublicKey;
    try {
      recipient = new PublicKey(address);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid address" }, { status: 400 });
    }

    const faucet = getFaucetKeypair();
    const conn = devnetConnection();

    let balance: number;
    try {
      balance = await conn.getBalance(faucet.publicKey, "confirmed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { ok: false, error: `Devnet RPC failed: ${msg}` },
        { status: 502 },
      );
    }

    if (balance < AIRDROP_AMOUNT + 10_000) {
      return NextResponse.json(
        {
          ok: false,
          error: `Faucet empty (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Try again later.`,
        },
        { status: 503 },
      );
    }

    const { blockhash, lastValidBlockHeight } =
      await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: recipient,
        lamports: AIRDROP_AMOUNT,
      }),
    );
    tx.recentBlockhash = blockhash;
    tx.feePayer = faucet.publicKey;
    tx.sign(faucet);

    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
      preflightCommitment: "confirmed",
    });

    // Poll confirmation — do NOT return ok until confirmed (or fail)
    let confirmed = false;
    let lastErr: string | null = null;
    for (let i = 0; i < 30; i++) {
      const st = await conn.getSignatureStatuses([sig], {
        searchTransactionHistory: true,
      });
      const v = st.value[0];
      if (v?.err) {
        throw new Error(`Airdrop tx failed on-chain: ${JSON.stringify(v.err)}`);
      }
      if (
        v?.confirmationStatus === "confirmed" ||
        v?.confirmationStatus === "finalized"
      ) {
        confirmed = true;
        break;
      }
      // block height expiry
      try {
        const height = await conn.getBlockHeight("confirmed");
        if (height > lastValidBlockHeight) {
          lastErr = "Blockhash expired before confirmation";
          break;
        }
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!confirmed) {
      throw new Error(
        lastErr ||
          `Airdrop not confirmed after 30s (sig ${sig.slice(0, 12)}…). RPC may be slow — check explorer.`,
      );
    }

    void notifyEvent(
      {
        kind: "airdrop",
        emoji: "💧",
        title: "Devnet airdrop sent",
        fields: { recipient: address, amount: 0.1, signature: sig },
      },
      { req },
    );

    return NextResponse.json({
      ok: true,
      signature: sig,
      amount: 0.1,
      explorer: `https://solscan.io/tx/${sig}?cluster=devnet`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void notifyEvent(
      {
        kind: "airdrop_error",
        emoji: "⚠️",
        title: "Airdrop failed",
        fields: { error: msg },
      },
      { req },
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
