/**
 * Resolve Solana addresses and name-service domains (.sol / .bonk / .skr).
 * Domain resolution hits /api/resolve (server has Bonfida + ANS parsers).
 */

export type ResolveKind = "pubkey" | "sol" | "ans";

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
const SUPPORTED_TLDS = new Set(["sol", "bonk", "skr"]);

/** True if the string looks like a multi-label domain (name.tld). */
export function looksLikeDomain(input: string): boolean {
  const s = input.trim().toLowerCase();
  if (!s.includes(".")) return false;
  return DOMAIN_RE.test(s);
}

export function supportedDomainTld(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!looksLikeDomain(s)) return null;
  const tld = s.split(".").pop() || "";
  return SUPPORTED_TLDS.has(tld) ? tld : null;
}

/** True if input might still be a base58 pubkey (length heuristic). */
export function looksLikePubkey(input: string): boolean {
  const s = input.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Resolve a recipient field to a wallet pubkey.
 * Accepts base58 addresses, name.sol, name.bonk, name.skr.
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
    const tld = supportedDomainTld(input);
    if (!tld) {
      return {
        ok: false,
        input,
        error: "Supported names: .sol, .bonk, .skr",
      };
    }
  } else if (!looksLikePubkey(input)) {
    // bare name without tld — try as .sol convenience? keep strict for now
    return { ok: false, input, error: "Enter a wallet address or name.sol / name.bonk / name.skr" };
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
