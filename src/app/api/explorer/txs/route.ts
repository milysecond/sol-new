import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  mainnetRpcCall,
  mainnetRpcEndpoints,
  devnetRpcEndpoints,
  isRateLimitedMessage,
} from "@/lib/rpc-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const noStore = { "Cache-Control": "no-store" };

type RpcSig = {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus?: string | null;
};

type SigRow = {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus: string | null;
  feeLamports: number | null;
};

function sanitizeRpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "RPC failed");
  if (
    isRateLimitedMessage(raw) ||
    /403|401|402|blocked|forbidden|payment required|too many/i.test(raw)
  ) {
    return "RPC temporarily unavailable — try Refresh in a moment";
  }
  if (raw.length > 160 || raw.includes("{") || raw.includes("jsonrpc")) {
    return "Failed to load transactions";
  }
  return raw;
}

async function devnetRpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const endpoints = devnetRpcEndpoints();
  let lastErr: Error | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        lastErr = new Error(`RPC HTTP ${res.status}`);
        if ([401, 402, 403, 429].includes(res.status) || res.status >= 500) continue;
        continue;
      }
      const j = (await res.json()) as {
        result?: T;
        error?: { message?: string };
      };
      if (j.error) {
        lastErr = new Error(j.error.message || "RPC error");
        if (isRateLimitedMessage(lastErr.message)) continue;
        throw lastErr;
      }
      return j.result as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (isRateLimitedMessage(lastErr.message)) continue;
    }
  }
  throw lastErr || new Error("All devnet RPC endpoints failed");
}

/** Best-effort fee map via JSON-RPC batch against the first healthy mainnet endpoint. */
async function fetchFeesBatch(
  sigs: string[],
  network: "mainnet" | "devnet",
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (sigs.length === 0) return out;

  const endpoints =
    network === "devnet" ? devnetRpcEndpoints() : mainnetRpcEndpoints();

  const batch = sigs.map((sig, i) => ({
    jsonrpc: "2.0" as const,
    id: i,
    method: "getTransaction",
    params: [
      sig,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ],
  }));

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if ([401, 402, 403, 429].includes(res.status) || res.status >= 500) continue;
        continue;
      }
      const j = (await res.json()) as
        | Array<{
            id?: number;
            result?: { meta?: { fee?: number } | null } | null;
            error?: unknown;
          }>
        | { error?: unknown };

      if (!Array.isArray(j)) continue;

      for (const item of j) {
        const id = typeof item.id === "number" ? item.id : -1;
        const sig = sigs[id];
        if (!sig) continue;
        const fee = item.result?.meta?.fee;
        out.set(sig, typeof fee === "number" && Number.isFinite(fee) ? fee : null);
      }
      // Fill any missing
      for (const sig of sigs) {
        if (!out.has(sig)) out.set(sig, null);
      }
      return out;
    } catch {
      continue;
    }
  }

  for (const sig of sigs) out.set(sig, null);
  return out;
}

/**
 * GET /api/explorer/txs?address=<pubkey>&limit=40&before=<sig>&network=mainnet|devnet
 * Uses mainnetRpcCall pool (Helius failover) so PublicNode/aex402 403s don't break history.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() || "";
  const before = req.nextUrl.searchParams.get("before")?.trim() || undefined;
  const network =
    req.nextUrl.searchParams.get("network") === "devnet" ? "devnet" : "mainnet";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "40");
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));

  if (!BASE58_RE.test(address)) {
    return NextResponse.json(
      { ok: false, error: "Invalid address" },
      { status: 400, headers: noStore },
    );
  }

  try {
    // eslint-disable-next-line no-new
    new PublicKey(address);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid address" },
      { status: 400, headers: noStore },
    );
  }

  try {
    const opts: { limit: number; before?: string } = { limit };
    if (before) opts.before = before;

    const sigs =
      network === "devnet"
        ? await devnetRpcCall<RpcSig[]>("getSignaturesForAddress", [address, opts])
        : await mainnetRpcCall<RpcSig[]>("getSignaturesForAddress", [address, opts], {
            timeoutMs: 18_000,
          });

    const list = Array.isArray(sigs) ? sigs : [];
    const sigList = list.map((s) => s.signature);

    // Fees are best-effort — never fail the list if fee batch dies
    let feeBySig = new Map<string, number | null>();
    try {
      feeBySig = await fetchFeesBatch(sigList, network);
    } catch {
      for (const s of sigList) feeBySig.set(s, null);
    }

    const transactions: SigRow[] = list.map((s) => ({
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
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeRpcError(e),
      },
      { status: 502, headers: noStore },
    );
  }
}
