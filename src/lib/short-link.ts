/** Shared validation + code generation for sol.new short links. */

/** Platform fee vault (same as NFT mint fees). */
export const LINK_FEE_VAULT = "Deqi6CBfo2FR2XVZXxSwmcjELy1JdbAXWDNFPzDAbtxW";

/** Custom short codes cost 0.01 SOL. Random codes are free. */
export const CUSTOM_LINK_FEE_SOL = 0.01;
export const CUSTOM_LINK_FEE_LAMPORTS = 10_000_000;

export const SHORT_CODE_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
export const RESERVED_CODES = new Set([
  "api",
  "link",
  "links",
  "l",
  "admin",
  "www",
  "app",
  "static",
  "assets",
  "favicon",
  "robots",
  "sitemap",
  "health",
]);

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no 0/o/1/l

export function randomShortCode(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidCustomCode(code: string): boolean {
  if (!SHORT_CODE_RE.test(code)) return false;
  if (RESERVED_CODES.has(code)) return false;
  return true;
}

/**
 * Normalize and validate a destination URL.
 * Only http(s). Rejects javascript:, data:, etc.
 */
export function normalizeTargetUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a URL" };
  if (trimmed.length > 2048) return { ok: false, error: "URL is too long" };

  let withScheme = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    withScheme = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" };
  }
  if (!parsed.hostname || parsed.hostname === "localhost") {
    // allow localhost in dev? reject for production safety
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return { ok: false, error: "Local URLs are not allowed" };
    }
  }

  return { ok: true, url: parsed.toString() };
}

export function shortPath(code: string): string {
  return `/l/${code}`;
}

export function absoluteShortUrl(code: string, origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  return `${base.replace(/\/$/, "")}${shortPath(code)}`;
}

/** Hosts we auto-redirect without an interstitial (same product brand). */
export function isTrustedShortLinkHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return h === "sol.new" || h.endsWith(".sol.new");
}
