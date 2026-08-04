/**
 * Resolve Solana addresses and name-service domains.
 * Supported TLDs: .sol · .bonk · .sns · .skr
 * - .sol  → Bonfida SNS (+ ANS fallback)
 * - .sns  → AllDomains if live, else Bonfida alias of .sol
 * - .bonk / .skr → AllDomains ANS
 */

export type ResolveKind = "pubkey" | "sol" | "sns" | "ans";

export interface ResolveOk {
  ok: true;
  input: string;
  owner: string;
  kind: ResolveKind;
  domain?: string;
  tld?: string;
  resolvedAs?: string;
}

export interface ResolveErr {
  ok: false;
  input: string;
  error: string;
}

export type ResolveResult = ResolveOk | ResolveErr;

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Official supported name TLDs */
export const SUPPORTED_TLDS = ["sol", "bonk", "sns", "skr"] as const;
export type SupportedTld = (typeof SUPPORTED_TLDS)[number];
const SUPPORTED_SET = new Set<string>(SUPPORTED_TLDS);

export const FEATURED_TLDS = SUPPORTED_TLDS;

export const NAME_HINT = "wallet or name.sol / .bonk / .sns / .skr";
export const NAME_PLACEHOLDER = "Address or name.sol / .bonk / .sns / .skr";

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

export function supportedDomainTld(input: string): SupportedTld | null {
  const tld = domainTld(input);
  if (!tld || !SUPPORTED_SET.has(tld)) return null;
  return tld as SupportedTld;
}

export function looksLikePubkey(input: string): boolean {
  const s = input.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Resolve a recipient field to a wallet pubkey.
 * Accepts base58 and name.sol / name.bonk / name.sns / name.skr.
 */
export async function resolveRecipient(raw: string): Promise<ResolveResult> {
  const input = raw.trim();
  if (!input) return { ok: false, input, error: "Enter an address or name" };

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
    if (!supportedDomainTld(input)) {
      return {
        ok: false,
        input,
        error: "Supported names: .sol, .bonk, .sns, .skr",
      };
    }
  } else if (!looksLikePubkey(input)) {
    return { ok: false, input, error: `Enter a ${NAME_HINT}` };
  }

  try {
    const res = await fetch(`/api/resolve?name=${encodeURIComponent(input)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      owner?: string;
      kind?: ResolveKind;
      domain?: string;
      tld?: string;
      resolvedAs?: string;
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
      resolvedAs: data.resolvedAs,
    };
  } catch {
    return { ok: false, input, error: "Could not resolve name" };
  }
}
