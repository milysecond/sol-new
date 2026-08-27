import { NextRequest, NextResponse } from "next/server";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import { notifyEvent } from "@/lib/notify";
import { devnetRpcEndpoints } from "@/lib/rpc-server";

const AIRDROP_AMOUNT = 0.1 * LAMPORTS_PER_SOL;

function getFaucetKeypair(): Keypair {
  const raw = process.env.FAUCET_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("FAUCET_PRIVATE_KEY not configured");
  const key = JSON.parse(raw) as number[];
  if (!Array.isArray(key) || key.length < 32) {
    throw new Error("FAUCET_PRIVATE_KEY invalid");
  }
  return Keypair.fromSecretKey(new Uint8Array(key));
}

async function tryServerSend(
  recipient: PublicKey,
  faucet: Keypair,
): Promise<{ signature: string; method: string } | null> {
  for (const url of devnetRpcEndpoints()) {
    const host = url.replace(/^https?:\/\//, "").split(/[/?]/)[0] || "rpc";
    try {
      const conn = new Connection(url, "confirmed");
      try {
        const sig = await conn.requestAirdrop(recipient, AIRDROP_AMOUNT);
        for (let i = 0; i < 20; i++) {
          const st = await conn.getSignatureStatuses([sig]);
          const v = st.value[0];
          if (v?.err) throw new Error(JSON.stringify(v.err));
          if (
            v?.confirmationStatus === "confirmed" ||
            v?.confirmationStatus === "finalized"
          ) {
            return { signature: sig, method: `requestAirdrop@${host}` };
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      } catch {
        /* try faucet transfer */
      }

      const bal = await conn.getBalance(faucet.publicKey, "confirmed");
      if (bal < AIRDROP_AMOUNT + 10_000) continue;

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
        maxRetries: 3,
      });
      for (let i = 0; i < 20; i++) {
        const st = await conn.getSignatureStatuses([sig]);
        const v = st.value[0];
        if (v?.err) throw new Error(JSON.stringify(v.err));
        if (
          v?.confirmationStatus === "confirmed" ||
          v?.confirmationStatus === "finalized"
        ) {
          return { signature: sig, method: `faucet@${host}` };
        }
        if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) {
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch {
      /* next rpc */
    }
  }
  return null;
}

export async function GET() {
  try {
    const faucet = getFaucetKeypair();
    let balance: number | null = null;
    for (const url of devnetRpcEndpoints()) {
      try {
        const conn = new Connection(url, "confirmed");
        balance =
          (await conn.getBalance(faucet.publicKey, "confirmed")) /
          LAMPORTS_PER_SOL;
        break;
      } catch {
        /* next */
      }
    }
    return NextResponse.json({
      ok: true,
      address: faucet.publicKey.toBase58(),
      balance,
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
    const body = (await req.json()) as {
      address?: string;
      signature?: string;
      /** Client-fetched devnet blockhash for faucet-signed tx */
      blockhash?: string;
      lastValidBlockHeight?: number;
    };
    const address = body.address?.trim();
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

    // Client confirmed broadcast
    if (body.signature && body.signature.length >= 64 && !body.blockhash) {
      void notifyEvent(
        {
          kind: "airdrop",
          emoji: "💧",
          title: "Devnet airdrop sent",
          fields: {
            recipient: address,
            amount: 0.1,
            signature: body.signature,
            method: "client_broadcast",
          },
        },
        { req },
      );
      return NextResponse.json({
        ok: true,
        signature: body.signature,
        amount: 0.1,
        method: "client_broadcast",
        explorer: `/receipt/${body.signature}`,
      });
    }

    // Client provides blockhash → we sign → client broadcasts
    if (body.blockhash) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: faucet.publicKey,
          toPubkey: recipient,
          lamports: AIRDROP_AMOUNT,
        }),
      );
      tx.recentBlockhash = body.blockhash;
      tx.feePayer = faucet.publicKey;
      tx.sign(faucet);
      return NextResponse.json({
        ok: false,
        needsClientBroadcast: true,
        transaction: Buffer.from(
          tx.serialize({ requireAllSignatures: true }),
        ).toString("base64"),
        blockhash: body.blockhash,
        lastValidBlockHeight: body.lastValidBlockHeight ?? null,
        faucet: faucet.publicKey.toBase58(),
        amount: 0.1,
      });
    }

    // Try server-side first
    const sent = await tryServerSend(recipient, faucet);
    if (sent) {
      void notifyEvent(
        {
          kind: "airdrop",
          emoji: "💧",
          title: "Devnet airdrop sent",
          fields: {
            recipient: address,
            amount: 0.1,
            signature: sent.signature,
            method: sent.method,
          },
        },
        { req },
      );
      return NextResponse.json({
        ok: true,
        signature: sent.signature,
        amount: 0.1,
        method: sent.method,
        explorer: `/receipt/${sent.signature}`,
      });
    }

    // Tell client to fetch blockhash and retry with client broadcast path
    return NextResponse.json({
      ok: false,
      needsClientBroadcast: true,
      needsBlockhash: true,
      error:
        "Worker cannot reach devnet RPC (IP blocked). Client will fetch blockhash and broadcast.",
      faucet: faucet.publicKey.toBase58(),
      amount: 0.1,
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
