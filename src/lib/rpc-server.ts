/**
 * Server-only RPC URLs. Never import this from client components.
 *
 * Mainnet pool (paid only — never free public Solana RPC):
 *   1. Helius Fast: cassandra-bq5oqs
 *   2. Helius Fast: viviyan-bkj12u
 *   3. Flux RPC (FLUXRPC_URL secret, full URL with key)
 *
 * Optional extras when configured:
 *   - HELIUS_API_KEY → mainnet.helius-rpc.com
 *   - MAINNET_RPC override
 */

/** Dedicated Helius Fast mainnet endpoints (auth in subdomain). */
export const HELIUS_MAINNET_CASSANDRA =
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com/";
export const HELIUS_MAINNET_VIVIYAN =
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com";

/** Ordered paid mainnet endpoints for failover. No free public nodes. */
export function mainnetRpcEndpoints(): string[] {
  const list: string[] = [HELIUS_MAINNET_CASSANDRA, HELIUS_MAINNET_VIVIYAN];

  const flux = process.env.FLUXRPC_URL?.trim();
  if (flux) list.push(flux);

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    list.push(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`);
  }

  const override = process.env.MAINNET_RPC?.trim();
  if (override) list.push(override);

  // de-dupe while preserving order (normalize trailing slash for compare)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of list) {
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
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
