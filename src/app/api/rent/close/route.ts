import { NextRequest, NextResponse } from "next/server";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  connectionForNetwork,
  feePayerConfigured,
  feePayerPubkey,
  loadFeePayerKeypair,
  sponsorAndSend,
} from "@/lib/fee-payer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHUNK = 8;
const noStore = { "Cache-Control": "no-store" };

/**
 * Optional external Kora JSON-RPC (if you run a Kora node).
 * Env: KORA_RPC_URL — when set, GET reports kora:true and client can prefer it.
 * Gasless closes still use sol.new fee payer by default (same UX as freerent).
 */
function koraUrl(): string | undefined {
  return process.env.KORA_RPC_URL?.trim() || undefined;
}

/** GET — sponsor / kora availability */
export async function GET() {
  const configured = feePayerConfigured();
  let feePayer: string | null = null;
  if (configured) {
    try {
      feePayer = feePayerPubkey();
    } catch {
      feePayer = null;
    }
  }
  const kora = koraUrl() || null;
  return NextResponse.json({
    ok: configured || Boolean(kora),
    sponsored: configured && Boolean(feePayer),
    feePayer,
    kora: Boolean(kora),
    koraUrl: kora ? "[configured]" : null,
    note: configured
      ? "sol.new sponsors network fees for empty-account closes (gasless)"
      : kora
        ? "Kora RPC configured"
        : "Sponsorship unavailable — user pays SOL fees",
  });
}

type CloseBody = {
  /** Owner wallet (must sign) */
  owner?: string;
  /** Empty token account addresses to close */
  accounts?: string[];
  network?: string;
  /**
   * Step 2: base64 tx already signed by owner (feePayer = sponsor).
   * Server co-signs + sends.
   */
  transaction?: string;
};

/**
 * POST /api/rent/close
 *
 * A) Build: { owner, accounts[] } → { transaction base64, feePayer } for user partial-sign
 * B) Submit: { transaction } → sponsor cosign + send (gasless)
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CloseBody;

    // ── Submit path ────────────────────────────────────────────────────────
    if (body.transaction && typeof body.transaction === "string") {
      if (!feePayerConfigured()) {
        return NextResponse.json(
          { ok: false, error: "Sponsorship unavailable" },
          { status: 503, headers: noStore },
        );
      }
      // Validate only closeAccount instructions to our fee payer
      const raw = Buffer.from(body.transaction, "base64");
      let tx: Transaction;
      try {
        tx = Transaction.from(raw);
      } catch {
        return NextResponse.json(
          { error: "Invalid transaction" },
          { status: 400, headers: noStore },
        );
      }
      const payer = loadFeePayerKeypair().publicKey;
      if (!tx.feePayer?.equals(payer)) {
        return NextResponse.json(
          { error: "feePayer must be sol.new sponsor" },
          { status: 400, headers: noStore },
        );
      }
      for (const ix of tx.instructions) {
        const okProg =
          ix.programId.equals(TOKEN_PROGRAM_ID) ||
          ix.programId.equals(TOKEN_2022_PROGRAM_ID);
        // closeAccount = instruction 9 for both programs
        if (!okProg || ix.data[0] !== 9) {
          return NextResponse.json(
            { error: "Only empty token-account close instructions allowed" },
            { status: 400, headers: noStore },
          );
        }
      }
      const result = await sponsorAndSend({
        transactionBase64: body.transaction,
        network: body.network === "devnet" ? "devnet" : "mainnet",
        maxFeeLamports: 5_000_000, // 0.005 SOL fees max for batch
      });
      return NextResponse.json(
        { ok: true, signature: result.signature, feePayer: result.feePayer, gasless: true },
        { headers: noStore },
      );
    }

    // ── Build path ─────────────────────────────────────────────────────────
    const ownerStr = body.owner?.trim() || "";
    const accounts = Array.isArray(body.accounts)
      ? body.accounts.map((a) => String(a).trim()).filter(Boolean)
      : [];
    if (!ownerStr || accounts.length === 0) {
      return NextResponse.json(
        { error: "owner and accounts[] required" },
        { status: 400, headers: noStore },
      );
    }
    if (accounts.length > 32) {
      return NextResponse.json(
        { error: "Max 32 accounts per request — split batches" },
        { status: 400, headers: noStore },
      );
    }

    let owner: PublicKey;
    try {
      owner = new PublicKey(ownerStr);
    } catch {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }

    const network = body.network === "devnet" ? "devnet" : "mainnet";
    if (network !== "mainnet") {
      return NextResponse.json(
        { error: "Mainnet only for rent reclaim" },
        { status: 400, headers: noStore },
      );
    }

    const conn = connectionForNetwork("mainnet");
    const sponsored = feePayerConfigured();
    let feePayer: PublicKey = owner;
    if (sponsored) {
      try {
        feePayer = loadFeePayerKeypair().publicKey;
      } catch {
        feePayer = owner;
      }
    }

    // Verify each account is empty token account owned by wallet
    const ixs: TransactionInstruction[] = [];
    const verified: string[] = [];
    let reclaimLamports = 0;

    for (const acc of accounts) {
      let pk: PublicKey;
      try {
        pk = new PublicKey(acc);
      } catch {
        continue;
      }
      const info = await conn.getParsedAccountInfo(pk, "confirmed");
      const val = info.value;
      if (!val) continue;
      const ownerProg = val.owner;
      const isT22 = ownerProg.equals(TOKEN_2022_PROGRAM_ID);
      const isSpl = ownerProg.equals(TOKEN_PROGRAM_ID);
      if (!isT22 && !isSpl) continue;

      const parsed = val.data as {
        parsed?: {
          info?: {
            owner?: string;
            tokenAmount?: { amount?: string };
          };
          type?: string;
        };
      };
      const pinfo = parsed?.parsed?.info;
      if (!pinfo) continue;
      if (pinfo.owner !== owner.toBase58()) continue;
      if ((pinfo.tokenAmount?.amount || "0") !== "0") continue;

      reclaimLamports += val.lamports;
      ixs.push(
        createCloseAccountInstruction(
          pk,
          owner, // destination = reclaim SOL to user
          owner, // authority
          [],
          isT22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        ),
      );
      verified.push(pk.toBase58());
    }

    if (ixs.length === 0) {
      return NextResponse.json(
        { error: "No empty token accounts to close" },
        { status: 400, headers: noStore },
      );
    }

    // Chunk into multiple txs if needed
    const txs: { transaction: string; accounts: string[]; count: number }[] = [];
    for (let i = 0; i < ixs.length; i += CHUNK) {
      const chunkIxs = ixs.slice(i, i + CHUNK);
      const chunkAcc = verified.slice(i, i + CHUNK);
      const tx = new Transaction().add(...chunkIxs);
      const { blockhash, lastValidBlockHeight } =
        await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = feePayer;
      // lastValidBlockHeight stored for client
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      txs.push({
        transaction: Buffer.from(serialized).toString("base64"),
        accounts: chunkAcc,
        count: chunkIxs.length,
      });
      void lastValidBlockHeight;
    }

    return NextResponse.json(
      {
        ok: true,
        gasless: sponsored && !feePayer.equals(owner),
        feePayer: feePayer.toBase58(),
        reclaimLamports,
        reclaimSol: reclaimLamports / 1e9,
        batches: txs,
        // convenience single batch
        transaction: txs[0]?.transaction,
        accountCount: verified.length,
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/rent/close]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Close failed" },
      { status: 502, headers: noStore },
    );
  }
}
