import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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
  buildSplGiftInstructions,
  buildUsdcGiftInstructions,
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
  // Token-2022 first — most meme mints; wrong Tokenkeg → "incorrect program id"
  for (const programId of [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]) {
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
      /** Private: fund via one-time hop so gift is not funded directly from main wallet */
      private?: boolean;
    };
    const isPrivate = body.private === true;

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
      // Always resolve mint on-chain — client programId is often wrong (Tokenkeg vs Token-2022)
      const meta = await resolveMintMeta(connection, token);
      decimals = meta.decimals;
      programId = meta.programId;
      // Prefer client decimals only if they match chain (ignore if off)
      if (
        typeof body.decimals === "number" &&
        body.decimals >= 0 &&
        body.decimals <= 12 &&
        body.decimals === meta.decimals
      ) {
        decimals = body.decimals;
      }
      // If client claimed a programId, only keep it when it matches chain
      if (body.programId && body.programId === meta.programId) {
        programId = body.programId;
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
    const isSpl = !isNativeGiftToken(token);

    const claimUrl = buildGiftUrl(
      secret,
      network,
      typeof body.message === "string" ? body.message : undefined,
      requestOrigin(req),
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const registerBody = {
      publicKey: gift.publicKey.toBase58(),
      sender: isPrivate ? "private" : body.wallet,
      amountLamports: amountBase,
      network,
      token,
      private: isPrivate,
    };

    // ── Private: two-tx hop so gift parent is ephemeral, not main wallet ──
    if (isPrivate) {
      const hop = Keypair.generate();
      const hopSecret = Buffer.from(hop.secretKey).toString("base64");
      // hop pays tx2 fee + claim buffer on gift
      const HOP_TX_FEE = 15_000;
      const fundToHop = isNativeGiftToken(token)
        ? Number(amountBase) + CLAIM_FEE_LAMPORTS + HOP_TX_FEE
        : SPL_GIFT_FUND_LAMPORTS + HOP_TX_FEE + 5_000;

      // Tx1: main wallet → hop (SOL always; + SPL if token gift)
      const tx1 = new Transaction();
      tx1.add(
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: hop.publicKey,
          lamports: fundToHop,
        }),
      );
      if (!isNativeGiftToken(token)) {
        // token path: move SPL (+ rent SOL) to hop, then hop funds gift
        const tx1b = new Transaction();
        if (token === "USDC" || isUsdcGiftToken(token, network)) {
          tx1b.add(
            ...buildUsdcGiftInstructions(sender, hop.publicKey, Number(amountBase), network),
            SystemProgram.transfer({
              fromPubkey: sender,
              toPubkey: hop.publicKey,
              lamports: HOP_TX_FEE,
            }),
          );
        } else {
          const mint = new PublicKey(token);
          const prog = programId ? new PublicKey(programId) : undefined;
          tx1b.add(
            ...buildSplGiftInstructions(
              sender,
              hop.publicKey,
              amountBase,
              mint,
              decimals,
              prog,
            ),
            SystemProgram.transfer({
              fromPubkey: sender,
              toPubkey: hop.publicKey,
              lamports: HOP_TX_FEE,
            }),
          );
        }
        tx1b.recentBlockhash = blockhash;
        tx1b.feePayer = sender;

        // Tx2: hop → gift
        const tx2 = new Transaction().add(
          ...buildGiftFundingInstructions(
            hop.publicKey,
            gift.publicKey,
            amountBase,
            token,
            network,
            { decimals, programId },
          ),
        );
        tx2.recentBlockhash = blockhash;
        tx2.feePayer = hop.publicKey;

        return NextResponse.json({
          ok: true,
          private: true,
          transaction: Buffer.from(
            tx1b.serialize({ requireAllSignatures: false, verifySignatures: false }),
          ).toString("base64"),
          transaction2: Buffer.from(
            tx2.serialize({ requireAllSignatures: false, verifySignatures: false }),
          ).toString("base64"),
          hopSecret,
          hopPubkey: hop.publicKey.toBase58(),
          giftPubkey: gift.publicKey.toBase58(),
          secret,
          claimUrl,
          amount: amountUi,
          amountLamports: amountBase,
          token,
          symbol:
            body.symbol ||
            (token === "USDC" ? "USDC" : token === "SOL" ? "SOL" : undefined),
          decimals,
          programId,
          network,
          blockhash,
          lastValidBlockHeight,
          fees: {
            claimFeeLamports: CLAIM_FEE_LAMPORTS,
            splFundLamports: isSpl ? SPL_GIFT_FUND_LAMPORTS : 0,
            hop: true,
          },
          register: { method: "POST", path: "/api/gift", body: registerBody },
        });
      }

      // SOL private
      tx1.recentBlockhash = blockhash;
      tx1.feePayer = sender;
      const tx2 = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: hop.publicKey,
          toPubkey: gift.publicKey,
          lamports: Number(amountBase) + CLAIM_FEE_LAMPORTS,
        }),
      );
      tx2.recentBlockhash = blockhash;
      tx2.feePayer = hop.publicKey;

      return NextResponse.json({
        ok: true,
        private: true,
        transaction: Buffer.from(
          tx1.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ).toString("base64"),
        transaction2: Buffer.from(
          tx2.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ).toString("base64"),
        hopSecret,
        hopPubkey: hop.publicKey.toBase58(),
        giftPubkey: gift.publicKey.toBase58(),
        secret,
        claimUrl,
        amount: amountUi,
        amountLamports: amountBase,
        token,
        symbol: "SOL",
        decimals: 9,
        network,
        blockhash,
        lastValidBlockHeight,
        fees: { claimFeeLamports: CLAIM_FEE_LAMPORTS, splFundLamports: 0, hop: true },
        register: { method: "POST", path: "/api/gift", body: registerBody },
      });
    }

    // ── Standard: fund gift directly from main wallet ──
    const ixs = buildGiftFundingInstructions(
      sender,
      gift.publicKey,
      amountBase,
      token,
      network,
      { decimals, programId },
    );

    const tx = new Transaction().add(...ixs);
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender;

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      ok: true,
      private: false,
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
        body: registerBody,
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
      private: "optional bool — hop wallet so gift is not funded by main address",
    },
    flow: [
      "1. POST /api/gift/create → transaction + secret + claimUrl",
      "2. Sign transaction with sender wallet and send on-chain",
      "3. POST /api/gift with register body to index status",
      "4. Share claimUrl (secret in URL fragment)",
    ],
  });
}
