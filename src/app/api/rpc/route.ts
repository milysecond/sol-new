/**
 * Same-origin JSON-RPC proxy so browsers don't hit rate-limited public RPCs.
 * Uses server HELIUS_API_KEY / DEVNET_RPC pool — key never sent to client.
 *
 * POST /api/rpc
 *   body: { jsonrpc, id, method, params, network?: "mainnet"|"devnet" }
 *   or Solana web3 Connection format: standard JSON-RPC body + ?network=devnet
 */
import { NextRequest, NextResponse } from "next/server";
import {
  devnetRpcEndpoints,
  mainnetRpcEndpoints,
  isRateLimitedMessage,
} from "@/lib/rpc-server";

export const runtime = "edge";

type RpcBody = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: unknown[];
  network?: string;
};

const ALLOWED = new Set([
  "getHealth",
  "getSlot",
  "getBlockHeight",
  "getLatestBlockhash",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getParsedTokenAccountsByOwner",
  "getParsedAccountInfo",
  "getSignaturesForAddress",
  "getTransaction",
  "getParsedTransaction",
  "getParsedTransactions",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "getMinimumBalanceForRentExemption",
  "getEpochInfo",
  "getVersion",
  "getGenesisHash",
  "simulateTransaction",
  "sendTransaction",
  "getSignatureStatuses",
  "isBlockhashValid",
  "getProgramAccounts",
  "getAddressLookupTable",
]);

function endpointsFor(network: "mainnet" | "devnet"): string[] {
  return network === "devnet" ? devnetRpcEndpoints() : mainnetRpcEndpoints();
}

async function forward(
  network: "mainnet" | "devnet",
  payload: { jsonrpc: string; id: string | number; method: string; params: unknown[] },
): Promise<Response> {
  const endpoints = endpointsFor(network);
  let lastStatus = 502;
  let lastText = "All RPC endpoints failed";

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(18_000),
      });
      const text = await res.text();
      if (!res.ok) {
        lastStatus = res.status;
        lastText = text.slice(0, 200);
        if ([401, 402, 403, 429, 500, 502, 503].includes(res.status)) continue;
        continue;
      }
      try {
        const j = JSON.parse(text) as { error?: { message?: string; code?: number } };
        if (j.error?.message && isRateLimitedMessage(j.error.message)) {
          lastStatus = 429;
          lastText = j.error.message;
          continue;
        }
      } catch {
        /* return raw */
      }
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      lastText = e instanceof Error ? e.message : String(e);
      lastStatus = 502;
    }
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: payload.id,
      error: { code: -32000, message: lastText || `RPC failed (${lastStatus})` },
    },
    { status: 200 }, // web3.js expects JSON-RPC envelope
  );
}

export async function POST(req: NextRequest) {
  let body: RpcBody;
  try {
    body = (await req.json()) as RpcBody;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const method = body.method;
  if (!method || typeof method !== "string") {
    return NextResponse.json(
      { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Missing method" } },
      { status: 400 },
    );
  }

  // Allowlist to reduce abuse of the paid key
  if (!ALLOWED.has(method) && !method.startsWith("get")) {
    // still allow unknown get* methods used by newer web3
    if (!method.startsWith("get") && method !== "sendTransaction" && method !== "simulateTransaction") {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32601, message: `Method not allowed: ${method}` },
        },
        { status: 403 },
      );
    }
  }

  const qNet = req.nextUrl.searchParams.get("network");
  const bodyNet = body.network;
  const netRaw = (qNet || bodyNet || "mainnet").toLowerCase();
  const network: "mainnet" | "devnet" = netRaw === "devnet" ? "devnet" : "mainnet";

  return forward(network, {
    jsonrpc: body.jsonrpc || "2.0",
    id: body.id ?? 1,
    method,
    params: Array.isArray(body.params) ? body.params : [],
  });
}

/** Health: which network resolves */
export async function GET(req: NextRequest) {
  const net = req.nextUrl.searchParams.get("network") === "devnet" ? "devnet" : "mainnet";
  const eps = endpointsFor(net);
  return NextResponse.json({
    ok: true,
    network: net,
    endpoints: eps.length,
    // never leak URLs with api keys — only hostnames
    hosts: eps.map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return "unknown";
      }
    }),
  });
}
