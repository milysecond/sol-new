/** Short gift claim codes: sol.new/c/xxxxxxxx (8+ chars). */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";

export const CLAIM_CODE_MIN = 8;

export function generateClaimCode(length = CLAIM_CODE_MIN): string {
  const n = Math.max(CLAIM_CODE_MIN, length);
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function isFullClaimCode(s: string): boolean {
  return /^[A-Za-z0-9]{8,16}$/.test(s);
}

/** Chat apps often chop the code. 1-7 leftover chars = truncated, not invalid junk. */
export function isTruncatedClaimCode(s: string): boolean {
  return /^[A-Za-z0-9]{1,7}$/.test(s);
}

export function parseClaimCodeFromPath(pathname: string): string | null {
  const m = (pathname || "").replace(/\/+$/, "").match(/^\/c\/([A-Za-z0-9]+)$/i);
  return m?.[1] || null;
}
