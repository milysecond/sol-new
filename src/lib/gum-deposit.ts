/**
 * GUM Universal Deposit
 * https://docs.gum.ag/universal-deposit/overview
 * Host from docs demo: https://gum-api.jup.net/ud/mainnet-beta
 * Destination for sol.new is always Solana (chainId 900).
 */

import { PublicKey } from "@solana/web3.js";

export const GUM_SOLANA_CHAIN_ID = 900;

export const GUM_API_BASES = [
  process.env.GUM_API_BASE?.replace(/\/$/, "") || "",
  "https://gum-api.jup.net/ud/mainnet-beta",
].filter(Boolean);

export type GumChainStatus = { code: number; name: string };

export type GumDepositChain = {
  chainId: number;
  chainName: string;
  chainType: string;
  status: GumChainStatus;
  depositAddress: string | null;
  tokenAddress: string | null;
  minDeposit: string | null;
  feesUsd: number | null;
};

export type GumDepositResponse = { chains: GumDepositChain[] };

export function isSolanaPubkey(s: string): boolean {
  try {
    const pk = new PublicKey(s.trim());
    return pk.toBase58() === s.trim();
  } catch {
    return false;
  }
}

export function gumExplorer(chainId: number, address: string): string | null {
  if (!address) return null;
  switch (chainId) {
    case 1:
      return `https://etherscan.io/address/${address}`;
    case 8453:
      return `https://basescan.org/address/${address}`;
    case 42161:
      return `https://arbiscan.io/address/${address}`;
    case 101:
      return `https://suivision.xyz/account/${address}`;
    case 900:
      return `/address/${address}`;
    default:
      return null;
  }
}

export async function fetchGumDepositAddresses(
  destinationAddress: string,
): Promise<GumDepositResponse> {
  const dest = destinationAddress.trim();
  if (!isSolanaPubkey(dest)) {
    throw new Error("Invalid Solana destination");
  }
  let last = "GUM lookup failed";
  for (const base of GUM_API_BASES) {
    const url = `${base}/v2/deposit-addresses?chainId=${GUM_SOLANA_CHAIN_ID}&destinationAddress=${encodeURIComponent(dest)}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        last = `GUM HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: string }).message)
            : data && typeof data === "object" && "error" in data
              ? String((data as { error?: string }).error)
              : `GUM HTTP ${res.status}`;
        last = msg;
        continue;
      }
      const chains = (data as { chains?: GumDepositChain[] })?.chains;
      if (!Array.isArray(chains)) {
        last = "GUM returned no chains";
        continue;
      }
      return { chains };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}
