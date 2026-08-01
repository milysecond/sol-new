import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import { rpcUrlFor } from "@/lib/rpc-server";
import {
  CLAIM_FEE_LAMPORTS,
  SPL_GIFT_FUND_LAMPORTS,
  buildGiftFundingInstructions,
  buildGiftUrl,
  createGiftKeypair,
  giftAmountToBase,
  isNativeGiftToken,
  isUsdcGiftToken,
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

async function resolveMintMeta(
  connection: Connection,
  mintStr: string
): Promise<{ decimals: number; programId: string }> {
  const mint = new PublicKey(mintStr);
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const m = await getMint(connection, mint, "confirmed", programId);
      return { decimals: m.decimals, programId: programId.toBase58() };
    } catch {
      /* try next */
    }
  }
  throw new Error("Unknown or unsupported mint");
}

/**
 * POST /api/gift/create
 * token: "SOL" | "USDC" | <mint>
 * decimals/programId optional for SPL (auto-resolved on-chain if omitted)
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
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
      decimals?: number;
      programId?: string;
      symbol?: string;
    };

    if (!isPubkeyish(body.wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }

    const network = body.network === "devnet" ? "devnet" : "mainnet";
    const rawToken = (body.token || "SOL").trim();
    let token: GiftToken = rawToken === "sol" ? "SOL" : rawToken === "usdc" ? "USDC" : rawToken;

    if (!isNativeGiftToken(token) && token !== "USDC" && !isPubkeyish(token)) {
      return NextResponse.json({ error: "Invalid token mint" }, { status: 400 });
    }

    const amountUi =
      typeof body.amount === "string" ? Number(body.amount) : Number(body.amount);
    if (!Number.isFinite(amountUi) || amountUi <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const rpc = rpcUrlFor(network);
    const connection = new Connection(rpc, "confirmed");

    let decimals = 9;
    let programId: string | undefined;

    if (isNativeGiftToken(token)) {
      token = "SOL";
      decimals = 9;
      if (amountUi < 0.001) {
        return NextResponse.json({ error: "Minimum 0.001 SOL" }, { status: 400 });
      }
      if (amountUi > 1000) {
        return NextResponse.json({ error: "Amount too large" }, { status: 400 });
      }
    } else if (isUsdcGiftToken(token, network) || token === "USDC") {
      token = "USDC";
      decimals = 6;
      if (amountUi < 0.01) {
        return NextResponse.json({ error: "Minimum 0.01 USDC" }, { status: 400 });
      }
      if (amountUi > 100_000) {
        return NextResponse.json({ error: "Amount too large" }, { status: 400 });
      }
    } else {
      if (typeof body.decimals === "number" && body.decimals >= 0 && body.decimals <= 12) {
        decimals = body.decimals;
        programId = body.programId;
      } else {
        const meta = await resolveMintMeta(connection, token);
        decimals = meta.decimals;
        programId = meta.programId;
      }
      if (amountUi > 1e15) {
        return NextResponse.json({ error: "Amount too large" }, { status: 400 });
      }
    }

    const amountBase = giftAmountToBase(amountUi, token, decimals);
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
      network,
      { decimals, programId }
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender;

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

    const isSpl = !isNativeGiftToken(token);

    return NextResponse.json({
      ok: true,
      transaction: Buffer.from(serialized).toString("base64"),
      giftPubkey: gift.publicKey.toBase58(),
      secret,
      claimUrl,
      amount: amountUi,
      amountLamports: amountBase,
      token,
      symbol: body.symbol || (token === "USDC" ? "USDC" : token === "SOL" ? "SOL" : undefined),
      decimals,
      programId,
      network,
      blockhash,
      lastValidBlockHeight,
      fees: {
        claimFeeLamports: CLAIM_FEE_LAMPORTS,
        splFundLamports: isSpl ? SPL_GIFT_FUND_LAMPORTS : 0,
      },
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

export async function GET() {
  return NextResponse.json({
    name: "sol.new gift create",
    endpoint: "POST /api/gift/create",
    description:
      "Build an unsigned gift-funding transaction and a one-time claim secret. Secret is never stored server-side.",
    body: {
      wallet: "sender base58 pubkey",
      amount: "number (UI units)",
      token: "SOL | USDC | <mint> (optional, default SOL)",
      decimals: "optional for custom mint",
      programId: "optional Token program id",
      symbol: "optional display symbol",
      network: "mainnet | devnet (optional)",
      message: "optional claim note, max 80 chars",
    },
    flow: [
      "1. POST /api/gift/create → transaction + secret + claimUrl",
      "2. Sign transaction with sender wallet and send on-chain",
      "3. POST /api/gift with register body to index status",
      "4. Share claimUrl (secret in URL fragment)",
    ],
  });
}
