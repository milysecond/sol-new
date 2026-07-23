/**
 * Server-only RPC URLs. Never import this from client components.
 * Prefer Helius (secret env) or FLUXRPC_URL (full URL with key, Worker secret).
 */

export function mainnetRpcUrl(): string {
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
  const flux = process.env.FLUXRPC_URL?.trim();
  if (flux) return flux;
  return process.env.MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
}

export function devnetRpcUrl(): string {
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) return `https://devnet.helius-rpc.com/?api-key=${helius}`;
  return process.env.DEVNET_RPC?.trim() || "https://api.devnet.solana.com";
}

export function rpcUrlFor(network: "mainnet" | "devnet"): string {
  return network === "devnet" ? devnetRpcUrl() : mainnetRpcUrl();
}
