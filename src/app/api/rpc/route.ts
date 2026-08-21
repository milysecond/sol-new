/**
 * Same-origin JSON-RPC proxy (devnet + mainnet failover).
 * Browser → /api/rpc?network=devnet → server HELIUS / DEVNET_RPC / public.
 * API keys never leave the worker.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  devnetRpcEndpoints,
  mainnetRpcEndpoints,
  isRateLimitedMessage,
} from "@/lib/rpc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcBody = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  network?: string;
};

function isMethodAllowed(method: string): boolean {
  if (method === "sendTransaction" || method === "simulateTransaction") return true;
  if (method.startsWith("get") || method.startsWith("is")) return true;
  // common write-adjacent
  if (method === "requestAirdrop") return true;
  return false;
}

async function tryEndpoint(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; text: string } | { ok: false; status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 16_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, text: text.slice(0, 300) };
    }
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j.error?.message && isRateLimitedMessage(j.error.message)) {
        return { ok: false, status: 429, text: j.error.message };
      }
    } catch {
      /* pass through */
    }
    return { ok: true, text };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      text: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  try {
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
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32600, message: "Missing method" },
        },
        { status: 400 },
      );
    }

    if (!isMethodAllowed(method)) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32601, message: `Method not allowed: ${method}` },
        },
        { status: 403 },
      );
    }

    const qNet = req.nextUrl.searchParams.get("network");
    const netRaw = (qNet || body.network || "mainnet").toLowerCase();
    const network: "mainnet" | "devnet" = netRaw === "devnet" ? "devnet" : "mainnet";
    const endpoints = network === "devnet" ? devnetRpcEndpoints() : mainnetRpcEndpoints();

    const payload = {
      jsonrpc: body.jsonrpc || "2.0",
      id: body.id ?? 1,
      method,
      params: body.params ?? [],
    };

    let last = "All RPC endpoints failed";
    for (const url of endpoints) {
      const r = await tryEndpoint(url, payload);
      if (r.ok) {
        return new NextResponse(r.text, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
      last = r.text || `HTTP ${r.status}`;
      if (![401, 402, 403, 429, 500, 502, 503, 504].includes(r.status) && r.status < 500) {
        // non-retryable HTTP — still try next for upstream flukes
      }
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id: payload.id,
      error: { code: -32000, message: last },
    });
  } catch (e) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32603,
        message: e instanceof Error ? e.message : "Internal RPC proxy error",
      },
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const net = req.nextUrl.searchParams.get("network") === "devnet" ? "devnet" : "mainnet";
    const eps = net === "devnet" ? devnetRpcEndpoints() : mainnetRpcEndpoints();
    // Probe first endpoint quickly
    let healthy = false;
    let slot: number | null = null;
    if (eps[0]) {
      const r = await tryEndpoint(eps[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "processed" }],
      });
      if (r.ok) {
        try {
          const j = JSON.parse(r.text) as { result?: number };
          if (typeof j.result === "number") {
            healthy = true;
            slot = j.result;
          }
        } catch {
          /* ignore */
        }
      }
    }
    return NextResponse.json({
      ok: healthy,
      network: net,
      endpoints: eps.length,
      slot,
      hosts: eps.map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return "invalid";
        }
      }),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
