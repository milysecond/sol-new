/**
 * Server-only RPC URLs. Never import this from client components.
 *
 * Mainnet pool (paid first; PublicNode is the only public secondary):
 *   1. Helius Fast: viviyan-bkj12u
 *   2. Helius Fast: velvet-hw7q70
 *   3. Helius Fast: cassandra-bq5oqs
 *   4. PublicNode (https://solana.publicnode.com) — secondary public fallback
 *   5. HELIUS_API_KEY → mainnet.helius-rpc.com
 *   6. Flux RPC (FLUXRPC_URL secret)
 *   7. aex402 (x402 paywalled — last resort only)
 *   8. MAINNET_RPC override (primary when set)
 */
export const AEX402_MAINNET = "https://rpc.aex402.com";
export const HELIUS_MAINNET_VIVIYAN =
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com";
export const HELIUS_MAINNET_VELVET =
  "https://velvet-hw7q70-fast-mainnet.helius-rpc.com";
export const HELIUS_MAINNET_CASSANDRA =
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com";
export const PUBLICNODE_MAINNET = "https://solana.publicnode.com";

function normalizeRpc(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Ordered paid mainnet endpoints for failover. No free public nodes. */
export function mainnetRpcEndpoints(): string[] {
  const list: string[] = [
    // Helius dedicated first — aex402 is x402-paywalled and returns 402
    HELIUS_MAINNET_VIVIYAN,
    HELIUS_MAINNET_VELVET,
    HELIUS_MAINNET_CASSANDRA,
    PUBLICNODE_MAINNET,
  ];

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    list.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
  }

  const flux = process.env.FLUXRPC_URL?.trim();
  if (flux) list.push(flux);

  // aex402 last — often 402 Payment Required without prepaid credits
  list.push(AEX402_MAINNET);

  const override = process.env.MAINNET_RPC?.trim();
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

export function devnetRpcEndpoints(): string[] {
  const list: string[] = [];
  const override = process.env.DEVNET_RPC?.trim();
  if (override) list.push(override);
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) list.push(`https://devnet.helius-rpc.com/?api-key=${helius}`);
  list.push("https://api.devnet.solana.com");
  const seen = new Set<string>();
  return list.filter((u) => {
    const k = normalizeRpc(u).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function devnetRpcUrl(): string {
  return devnetRpcEndpoints()[0] || "https://api.devnet.solana.com";
}

export function rpcUrlFor(network: "mainnet" | "devnet"): string {
  return network === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();
}

export function isRateLimitedMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("402") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("payment required") ||
    m.includes("pay $") ||
    m.includes("exhausted") ||
    m.includes("credit") ||
    m.includes("quota") ||
    m.includes("capacity") ||
    m.includes("max usage") ||
    m.includes("forbidden")
  );
}

/**
 * JSON-RPC POST against the mainnet pool with automatic failover.
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
        if (
          res.status === 402 ||
          res.status === 429 ||
          res.status >= 500 ||
          res.status === 401 ||
          res.status === 403
        ) {
          continue;
        }
        continue;
      }
      const j = (await res.json()) as {
        result?: T;
        error?: { message?: string; code?: number };
      };
      if (j.error) {
        const msg = j.error.message || JSON.stringify(j.error);
        lastErr = new Error(msg);
        if (
          isRateLimitedMessage(msg) ||
          (j.error.code != null && (j.error.code === 429 || j.error.code === -32099))
        ) {
          continue;
        }
        throw lastErr;
      }
      return j.result as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (isRateLimitedMessage(lastErr.message)) continue;
    }
  }
  throw lastErr || new Error("All mainnet RPC endpoints failed");
}

/** Send a signed base64 transaction via the paid mainnet pool. */
export async function sendRawTransactionMainnet(
  base64Tx: string,
  opts?: { skipPreflight?: boolean; maxRetries?: number },
): Promise<string> {
  const skipPreflight = opts?.skipPreflight ?? false;
  const maxRetries = opts?.maxRetries ?? 3;
  const sig = await mainnetRpcCall<string>("sendTransaction", [
    base64Tx,
    {
      encoding: "base64",
      skipPreflight,
      maxRetries,
      preflightCommitment: "confirmed",
    },
  ]);
  if (!sig || typeof sig !== "string") {
    throw new Error("RPC did not return a signature");
  }
  return sig;
}
