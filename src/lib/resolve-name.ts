/**
 * Resolve Solana addresses and name-service domains.
 * - .sol → Bonfida SNS (+ ANS fallback)
 * - .sns / .bonk / .skr / other AllDomains TLDs → ANS
 * Domain resolution hits /api/resolve (server has Bonfida + ANS parsers).
 */

export type ResolveKind = "pubkey" | "sol" | "sns" | "ans";

export interface ResolveOk {
  ok: true;
  input: string;
  owner: string;
  kind: ResolveKind;
  domain?: string;
  tld?: string;
}

export interface ResolveErr {
  ok: false;
  input: string;
  error: string;
}

export type ResolveResult = ResolveOk | ResolveErr;

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Highlighted TLDs in UI copy (any valid ANS TLD still resolves). */
export const FEATURED_TLDS = ["sol", "sns", "bonk", "skr"] as const;

/** True if the string looks like a multi-label domain (name.tld). */
export function looksLikeDomain(input: string): boolean {
  const s = input.trim().toLowerCase();
  if (!s.includes(".")) return false;
  return DOMAIN_RE.test(s);
}

export function domainTld(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!looksLikeDomain(s)) return null;
  return s.split(".").pop() || null;
}

/** @deprecated use domainTld — kept for call sites that checked allowlist */
export function supportedDomainTld(input: string): string | null {
  return domainTld(input);
}

/** True if input might still be a base58 pubkey (length heuristic). */
export function looksLikePubkey(input: string): boolean {
  const s = input.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

export const NAME_HINT = "wallet address or name.sol / name.sns / name.bonk / …";

/**
 * Resolve a recipient field to a wallet pubkey.
 * Accepts base58 addresses and name-service domains (.sol, .sns, AllDomains).
 */
export async function resolveRecipient(raw: string): Promise<ResolveResult> {
  const input = raw.trim();
  if (!input) return { ok: false, input, error: "Enter an address or name" };

  // Fast path: valid base58 pubkey (client-side; no network)
  if (looksLikePubkey(input) && !looksLikeDomain(input)) {
    try {
      const { PublicKey } = await import("@solana/web3.js");
      const pk = new PublicKey(input);
      return { ok: true, input, owner: pk.toBase58(), kind: "pubkey" };
    } catch {
      return { ok: false, input, error: "Invalid Solana address" };
    }
  }

  if (looksLikeDomain(input)) {
    // ok — resolve via API
  } else if (!looksLikePubkey(input)) {
    return {
      ok: false,
      input,
      error: `Enter a ${NAME_HINT}`,
    };
  }

  try {
    const res = await fetch(`/api/resolve?name=${encodeURIComponent(input)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      owner?: string;
      kind?: ResolveKind;
      domain?: string;
      tld?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.owner) {
      return { ok: false, input, error: data.error || "Name not found" };
    }
    return {
      ok: true,
      input,
      owner: data.owner,
      kind: data.kind || "ans",
      domain: data.domain,
      tld: data.tld,
    };
  } catch {
    return { ok: false, input, error: "Could not resolve name" };
  }
}
