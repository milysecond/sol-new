import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { mainnetRpcEndpoints, devnetRpcEndpoints } from "@/lib/rpc-server";

export const dynamic = "force-dynamic";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SigRow = {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus: string | null;
  /** Network fee paid by fee payer, in lamports */
  feeLamports: number | null;
};

/**
 * GET /api/explorer/txs?address=<pubkey>&limit=40&before=<sig>&network=mainnet|devnet
 * Solana Explorer–style signature list + fee (lamports) per tx.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() || "";
  const before = req.nextUrl.searchParams.get("before")?.trim() || undefined;
  const network =
    req.nextUrl.searchParams.get("network") === "devnet" ? "devnet" : "mainnet";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "40");
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));

  if (!BASE58_RE.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const endpoints =
    network === "devnet" ? devnetRpcEndpoints() : mainnetRpcEndpoints();

  let lastErr: unknown = null;
  for (const rpc of endpoints) {
    try {
      const connection = new Connection(rpc, "confirmed");
      const sigs = await connection.getSignaturesForAddress(pubkey, {
        limit,
        before: before || undefined,
      });

      const feeBySig = new Map<string, number | null>();
      // Batch getParsedTransactions for fees (RPC max ~100; keep chunks small)
      const sigList = sigs.map((s) => s.signature);
      const CHUNK = 20;
      for (let i = 0; i < sigList.length; i += CHUNK) {
        const chunk = sigList.slice(i, i + CHUNK);
        try {
          const parsed = await connection.getParsedTransactions(chunk, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          parsed.forEach((tx, idx) => {
            const sig = chunk[idx];
            const fee = tx?.meta?.fee;
            feeBySig.set(
              sig,
              typeof fee === "number" && Number.isFinite(fee) ? fee : null,
            );
          });
        } catch {
          for (const sig of chunk) {
            if (!feeBySig.has(sig)) feeBySig.set(sig, null);
          }
        }
      }

      const transactions: SigRow[] = sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        err: s.err ?? null,
        memo: s.memo ?? null,
        blockTime: s.blockTime ?? null,
        confirmationStatus: s.confirmationStatus ?? null,
        feeLamports: feeBySig.get(s.signature) ?? null,
      }));

      return NextResponse.json(
        {
          ok: true,
          address,
          network,
          transactions,
          hasMore: transactions.length >= limit,
          nextBefore:
            transactions.length > 0
              ? transactions[transactions.length - 1].signature
              : null,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=8, stale-while-revalidate=30",
          },
        },
      );
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        lastErr instanceof Error
          ? lastErr.message
          : "Failed to load transactions",
    },
    { status: 502 },
  );
}
