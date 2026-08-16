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

function devnetRpcEndpoints(): string[] {
  const list: string[] = [];
  const override = process.env.DEVNET_RPC?.trim();
  if (override) list.push(override);
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) list.push(`https://devnet.helius-rpc.com/?api-key=${helius}`);
  // Public / alt fallbacks when Helius is exhausted
  list.push("https://api.devnet.solana.com");
  list.push("https://rpc.ankr.com/solana_devnet");
  const seen = new Set<string>();
  return list.filter((u) => {
    const k = u.replace(/\/+$/, "").toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function withDevnetRpc<T>(
  fn: (conn: Connection) => Promise<T>,
): Promise<T> {
  let lastErr: Error | null = null;
  for (const url of devnetRpcEndpoints()) {
    try {
      const conn = new Connection(url, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60_000,
      });
      return await fn(conn);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message.toLowerCase();
      // try next on rate limit / network
      if (
        msg.includes("429") ||
        msg.includes("too many") ||
        msg.includes("max usage") ||
        msg.includes("403") ||
        msg.includes("fetch failed") ||
        msg.includes("econnrefused") ||
        msg.includes("timeout")
      ) {
        continue;
      }
      // other errors (e.g. bad pubkey) still try next for balance, else rethrow after pool
      continue;
    }
  }
  throw lastErr || new Error("All devnet RPCs failed");
}

export async function GET() {
  try {
    const faucet = getFaucetKeypair();
    const balance = await withDevnetRpc((conn) =>
      conn.getBalance(faucet.publicKey, "confirmed"),
    );
    return NextResponse.json({
      ok: true,
      address: faucet.publicKey.toBase58(),
      balance: balance / LAMPORTS_PER_SOL,
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

    const result = await withDevnetRpc(async (conn) => {
      const balance = await conn.getBalance(faucet.publicKey, "confirmed");
      if (balance < AIRDROP_AMOUNT + 10_000) {
        throw new Error(
          `Faucet empty (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Try again later.`,
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
            `Airdrop not confirmed after 30s (sig ${sig.slice(0, 12)}…). Check explorer.`,
        );
      }

      return { sig, balance };
    });

    void notifyEvent(
      {
        kind: "airdrop",
        emoji: "💧",
        title: "Devnet airdrop sent",
        fields: {
          recipient: address,
          amount: 0.1,
          signature: result.sig,
        },
      },
      { req },
    );

    return NextResponse.json({
      ok: true,
      signature: result.sig,
      amount: 0.1,
      explorer: `https://solscan.io/tx/${result.sig}?cluster=devnet`,
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
    const status =
      msg.toLowerCase().includes("empty") ? 503 :
      msg.toLowerCase().includes("invalid") ? 400 :
      500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
