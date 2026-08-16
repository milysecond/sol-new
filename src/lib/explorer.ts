/**
 * In-app explorer links only.
 * Never send users to Solscan, Orb Markets, or Solana Explorer.
 */

export function addressPath(address: string): string {
  return `/address/${encodeURIComponent(address)}`;
}

export function txPath(signature: string): string {
  return `/receipt/${encodeURIComponent(signature)}`;
}

export function tokenPath(mint: string): string {
  return `/token/${encodeURIComponent(mint)}`;
}

/** Human label for buttons */
export const EXPLORER_LABEL = "View on sol.new";
