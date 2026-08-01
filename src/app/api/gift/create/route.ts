import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { rpcUrlFor } from "@/lib/rpc-server";
import {
  CLAIM_FEE_LAMPORTS,
  USDC_GIFT_FUND_LAMPORTS,
  buildGiftFundingInstructions,
  buildGiftUrl,
  createGiftKeypair,
  giftAmountToBase,
  type GiftToken,
} from "@/lib/gift-link";

export const dynamic = "force-dynamic";

const recentIPs = new Map<string, number[]>();
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (recentIPs.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentIPs.set(ip, timestamps);
  return false;
}

function isPubkeyish(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 32 || s.length > 64) return false;
  try {
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "https://sol.new";
}

/**
 * POST /api/gift/create
 *
 * Build an unsigned gift-funding transaction + one-time claim secret.
 * The secret is NEVER stored server-side — only returned once.
 *
 * Body:
 * {
 *   wallet: string          // sender pubkey
 *   amount: number|string   // UI units (SOL or USDC)
 *   token?: "SOL"|"USDC"    // default SOL
 *   network?: "mainnet"|"devnet"
 *   message?: string        // optional note on claim URL (max 80)
 * }
 *
 * Response:
 * {
 *   ok, transaction (base64), giftPubkey, secret, claimUrl,
 *   amount, amountLamports, token, network, fees
 * }
 *
 * Client: sign + send `transaction`, then POST /api/gift to register status.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = (await req.json()) as {
      wallet?: string;
      amount?: number | string;
      token?: string;
      network?: string;
      message?: string;
    };

    if (!isPubkeyish(body.wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }

    const token: GiftToken = body.token === "USDC" ? "USDC" : "SOL";
    const network = body.network === "devnet" ? "devnet" : "mainnet";
    const amountUi = typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (token === "SOL" && amountUi < 0.001) {
      return NextResponse.json({ error: "Minimum 0.001 SOL" }, { status: 400 });
    }
    if (token === "USDC" && amountUi < 0.01) {
      return NextResponse.json({ error: "Minimum 0.01 USDC" }, { status: 400 });
    }
    if (token === "SOL" && amountUi > 1000) {
      return NextResponse.json({ error: "Amount too large" }, { status: 400 });
    }
    if (token === "USDC" && amountUi > 100_000) {
      return NextResponse.json({ error: "Amount too large" }, { status: 400 });
    }

    const amountBase = giftAmountToBase(amountUi, token);
    if (amountBase <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const sender = new PublicKey(body.wallet);
    const { keypair: gift, secret } = createGiftKeypair();
    const ixs = buildGiftFundingInstructions(
      sender,
      gift.publicKey,
      amountBase,
      token,
      network
    );

    const rpc = rpcUrlFor(network);
    const { Connection } = await import("@solana/web3.js");
    const connection = new Connection(rpc, "confirmed");
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender;
    // Do not sign — sender signs client-side with passkey

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const claimUrl = buildGiftUrl(
      secret,
      network,
      typeof body.message === "string" ? body.message : undefined,
      requestOrigin(req)
    );

    return NextResponse.json({
      ok: true,
      transaction: Buffer.from(serialized).toString("base64"),
      giftPubkey: gift.publicKey.toBase58(),
      secret,
      claimUrl,
      amount: amountUi,
      amountLamports: amountBase,
      token,
      network,
      blockhash,
      lastValidBlockHeight,
      fees: {
        claimFeeLamports: CLAIM_FEE_LAMPORTS,
        usdcFundLamports: token === "USDC" ? USDC_GIFT_FUND_LAMPORTS : 0,
      },
      // After funding on-chain, register with POST /api/gift
      register: {
        method: "POST",
        path: "/api/gift",
        body: {
          publicKey: gift.publicKey.toBase58(),
          sender: body.wallet,
          amountLamports: amountBase,
          network,
          token,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/** GET — quick docs for integrators. */
export async function GET() {
  return NextResponse.json({
    name: "sol.new gift create",
    endpoint: "POST /api/gift/create",
    description:
      "Build an unsigned gift-funding transaction and a one-time claim secret. Secret is never stored server-side.",
    body: {
      wallet: "sender base58 pubkey",
      amount: "number (UI units)",
      token: "SOL | USDC (optional, default SOL)",
      network: "mainnet | devnet (optional)",
      message: "optional claim note, max 80 chars",
    },
    flow: [
      "1. POST /api/gift/create → transaction + secret + claimUrl",
      "2. Sign transaction with sender wallet and send on-chain",
      "3. POST /api/gift with register body to index status",
      "4. Share claimUrl (secret in URL fragment)",
    ],
    related: {
      status: "GET /api/gift?pk=<giftPubkey>",
      claim: "PATCH /api/gift { publicKey, claimedBy, reclaim? }",
    },
  });
}
