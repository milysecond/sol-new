/**
 * Server-only RPC URLs. Never import this from client components.
 *
 * Mainnet pool (paid only — never free public Solana RPC):
 *   1. Helius Fast: viviyan-bkj12u
 *   2. Helius Fast: velvet-hw7q70
 *   3. Helius Fast: cassandra-bq5oqs (may be rate-limited / exhausted)
 *   4. Flux RPC (FLUXRPC_URL secret)
 *   5. HELIUS_API_KEY → mainnet.helius-rpc.com
 *   6. MAINNET_RPC override
 */

/** Dedicated Helius Fast mainnet endpoints (auth in subdomain). */
export const HELIUS_MAINNET_VIVIYAN =
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com";
export const HELIUS_MAINNET_VELVET =
  "https://velvet-hw7q70-fast-mainnet.helius-rpc.com";
export const HELIUS_MAINNET_CASSANDRA =
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com";

function normalizeRpc(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Ordered paid mainnet endpoints for failover. No free public nodes. */
export function mainnetRpcEndpoints(): string[] {
  const list: string[] = [
    HELIUS_MAINNET_VIVIYAN,
    HELIUS_MAINNET_VELVET,
    HELIUS_MAINNET_CASSANDRA,
  ];

  const flux = process.env.FLUXRPC_URL?.trim();
  if (flux) list.push(flux);

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    list.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
  }

  const override = process.env.MAINNET_RPC?.trim();
  // Prefer explicit override as primary when set
  if (override) list.unshift(override);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of list) {
    const key = normalizeRpc(url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeRpc(url));
  }
  return out;
}

/** Primary mainnet RPC (first in the paid pool). */
export function mainnetRpcUrl(): string {
  return mainnetRpcEndpoints()[0];
}

export function devnetRpcUrl(): string {
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) return `https://devnet.helius-rpc.com/?api-key=${helius}`;
  return process.env.DEVNET_RPC?.trim() || "https://api.devnet.solana.com";
}

export function rpcUrlFor(network: "mainnet" | "devnet"): string {
  return network === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();
}

function isRateLimitedMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("exhausted") ||
    m.includes("credit") ||
    m.includes("quota") ||
    m.includes("capacity")
  );
}

/**
 * JSON-RPC POST against the mainnet pool with automatic failover.
 * Retries next endpoint on network/HTTP/rate-limit/RPC errors.
 */
export async function mainnetRpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
  opts?: { timeoutMs?: number; id?: string | number },
): Promise<T> {
  const endpoints = mainnetRpcEndpoints();
  let lastErr: Error | null = null;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const id = opts?.id ?? 1;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        lastErr = new Error(`RPC HTTP ${res.status} @ ${url}`);
        if (res.status === 429 || res.status >= 500) continue;
        // other 4xx may be method-specific; still try next on 403/401
        if (res.status === 401 || res.status === 403) continue;
        continue;
      }
      const j = (await res.json()) as {
        result?: T;
        error?: { message?: string; code?: number };
      };
      if (j.error) {
        const msg = j.error.message || JSON.stringify(j.error);
        lastErr = new Error(msg);
        if (isRateLimitedMessage(msg) || (j.error.code != null && j.error.code === 429)) {
          continue;
        }
        // Non-rate-limit RPC errors (e.g. invalid params) — don't burn the pool
        throw lastErr;
      }
      return j.result as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      // try next endpoint
    }
  }
  throw lastErr || new Error("All mainnet RPC endpoints failed");
}
