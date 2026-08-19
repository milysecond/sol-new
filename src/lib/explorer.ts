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

/** Hub */
export function explorerPath(): string {
  return "/explorer";
}

export function explorerAddressPath(address: string): string {
  return `/explorer/address/${encodeURIComponent(address)}`;
}

export function explorerTxPath(signature: string): string {
  return `/explorer/tx/${encodeURIComponent(signature)}`;
}

export function explorerTokenPath(mint: string): string {
  return `/explorer/token/${encodeURIComponent(mint)}`;
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Route a pasted query to the right in-app explorer surface.
 * - long base58 (≥80) → receipt (tx)
 * - pubkey-length base58 → address lookup
 * - otherwise null
 */
export function classifyExplorerQuery(raw: string): {
  kind: "tx" | "address" | "token";
  href: string;
  value: string;
} | null {
  let q = raw.trim();
  if (!q) return null;

  // strip common external explorer prefixes users paste
  q = q
    .replace(/^https?:\/\/(solscan\.io|explorer\.solana\.com|orb\.markets)\//i, "")
    .replace(/^(tx|transaction|address|account|token|token-meta)\//i, (m) => m.toLowerCase());

  const lower = q.toLowerCase();
  if (lower.startsWith("tx/") || lower.startsWith("transaction/")) {
    const v = q.split("/").pop()!.trim();
    if (v) return { kind: "tx", href: txPath(v), value: v };
  }
  if (lower.startsWith("token/")) {
    const v = q.split("/").pop()!.trim();
    if (v) return { kind: "token", href: tokenPath(v), value: v };
  }
  if (
    lower.startsWith("address/") ||
    lower.startsWith("account/") ||
    lower.startsWith("wallet/")
  ) {
    const v = q.split("/").pop()!.trim();
    if (v) return { kind: "address", href: addressPath(v), value: v };
  }

  // bare value
  const v = q.split(/[/?#]/)[0].trim();
  if (!BASE58_RE.test(v)) return null;

  // signatures are longer; pubkeys ~32–44
  if (v.length >= 80 && v.length <= 128) {
    return { kind: "tx", href: txPath(v), value: v };
  }
  if (v.length >= 32 && v.length <= 44) {
    return { kind: "address", href: addressPath(v), value: v };
  }
  return null;
}

/** Human label for buttons */
export const EXPLORER_LABEL = "View on sol.new";
