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
import { devnetRpcEndpoints } from "@/lib/rpc-server";

const AIRDROP_AMOUNT = 0.1 * LAMPORTS_PER_SOL;

function getFaucetKeypair(): Keypair | null {
  const raw = process.env.FAUCET_PRIVATE_KEY?.trim();
  if (!raw) return null;
  try {
    const key = JSON.parse(raw) as number[];
    if (!Array.isArray(key) || key.length < 32) return null;
    return Keypair.fromSecretKey(new Uint8Array(key));
  } catch {
    return null;
  }
}


function isRetryableRpcError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("too many") ||
    m.includes("max usage") ||
    m.includes("403") ||
    m.includes("401") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("econnrefused") ||
    m.includes("timeout") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("blocked") ||
    m.includes("access forbidden")
  );
}

async function confirmSig(conn: Connection, sig: string, lastValidBlockHeight?: number) {
  for (let i = 0; i < 30; i++) {
    const st = await conn.getSignatureStatuses([sig], {
      searchTransactionHistory: true,
    });
    const v = st.value[0];
    if (v?.err) {
      throw new Error(`Tx failed on-chain: ${JSON.stringify(v.err)}`);
    }
    if (
      v?.confirmationStatus === "confirmed" ||
      v?.confirmationStatus === "finalized"
    ) {
      return;
    }
    if (lastValidBlockHeight != null) {
      try {
        const height = await conn.getBlockHeight("confirmed");
        if (height > lastValidBlockHeight) {
          throw new Error("Blockhash expired before confirmation");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("expired")) throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Not confirmed after 30s (${sig.slice(0, 12)}…)`);
}

/**
 * 1) Solana requestAirdrop (network faucet)
 * 2) Our funded faucet key transfer
 * Tries multiple RPCs.
 */
async function sendDevnetAirdrop(recipient: PublicKey): Promise<{
  signature: string;
  method: "requestAirdrop" | "faucet";
}> {
  const errors: string[] = [];
  const faucet = getFaucetKeypair();

  for (const url of devnetRpcEndpoints()) {
    const conn = new Connection(url, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60_000,
    });
    const host = url.replace(/^https?:\/\//, "").split("/")[0] || url;

    // Path A — official cluster faucet
    try {
      const sig = await conn.requestAirdrop(recipient, AIRDROP_AMOUNT);
      const { lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      await confirmSig(conn, sig, lastValidBlockHeight);
      return { signature: sig, method: "requestAirdrop" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`airdrop@${host}: ${msg.slice(0, 120)}`);
      if (!isRetryableRpcError(msg) && !msg.toLowerCase().includes("airdrop")) {
        // keep trying other RPCs anyway
      }
    }

    // Path B — our faucet wallet
    if (!faucet) continue;
    try {
      const balance = await conn.getBalance(faucet.publicKey, "confirmed");
      if (balance < AIRDROP_AMOUNT + 10_000) {
        errors.push(`faucet@${host}: empty (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
        continue;
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
      await confirmSig(conn, sig, lastValidBlockHeight);
      return { signature: sig, method: "faucet" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`transfer@${host}: ${msg.slice(0, 120)}`);
    }
  }

  throw new Error(
    errors.length
      ? `Airdrop failed on all RPCs. ${errors.slice(0, 4).join(" · ")}`
      : "Airdrop failed — no RPC available",
  );
}

export async function GET() {
  const faucet = getFaucetKeypair();
  const address = faucet?.publicKey.toBase58() || null;
  let balance: number | null = null;
  let error: string | undefined;

  if (faucet) {
    for (const url of devnetRpcEndpoints()) {
      try {
        const conn = new Connection(url, "confirmed");
        balance = (await conn.getBalance(faucet.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
        break;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  } else {
    error = "FAUCET_PRIVATE_KEY not set (requestAirdrop still works on POST)";
  }

  return NextResponse.json({
    ok: balance != null,
    address,
    balance,
    ...(balance == null && error ? { error } : {}),
  });
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

    const { signature, method } = await sendDevnetAirdrop(recipient);

    void notifyEvent(
      {
        kind: "airdrop",
        emoji: "💧",
        title: "Devnet airdrop sent",
        fields: {
          recipient: address,
          amount: 0.1,
          signature,
          method,
        },
      },
      { req },
    );

    return NextResponse.json({
      ok: true,
      signature,
      amount: 0.1,
      method,
      explorer: `https://solscan.io/tx/${signature}?cluster=devnet`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void notifyEvent(
      {
        kind: "airdrop_error",
        emoji: "⚠️",
        title: "Airdrop failed",
        fields: { error: msg.slice(0, 400) },
      },
      { req },
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
