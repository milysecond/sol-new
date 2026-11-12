import { Keypair } from "@solana/web3.js";
import { RING_LINK_PREFIX } from "./constants";

/**
 * Private pay links.
 *
 * A link is a fresh Ed25519 seed. Its Solana address is public (it shows up
 * on-chain as the sender's transfer recipient), so it sits in the path.
 * The seed is the bearer secret and lives ONLY in the URL fragment, which
 * browsers never send to a server. Gift links also copy their secret into the
 * query for Android App Links; Ring links deliberately do not.
 */

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

export type RingLinkSecret = { seed: Uint8Array; secret: string; address: string };

export function createRingLinkSecret(): RingLinkSecret {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return { seed, secret: toBase64Url(seed), address: Keypair.fromSeed(seed).publicKey.toBase58() };
}

export function seedFromRingSecret(secret: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  try {
    const seed = fromBase64Url(secret);
    return seed.length === 32 ? seed : null;
  } catch {
    return null;
  }
}

export function ringLinkPath(address: string): string {
  return `${RING_LINK_PREFIX}/${address}`;
}

export function ringLinkUrl(address: string, secret: string, origin = "https://sol.new"): string {
  return `${origin.replace(/\/$/, "")}${ringLinkPath(address)}#${secret}`;
}

export type ParsedRingLink =
  | { ok: true; address: string; seed: Uint8Array }
  | { ok: false; reason: "no-address" | "no-secret" | "bad-secret" | "mismatch" };

/** Reads `/ring/c/<address>` + `#<secret>`. Secret must derive the address. */
export function parseRingLink(loc: { pathname: string; hash: string }): ParsedRingLink {
  const m = loc.pathname.replace(/\/+$/, "").match(/^\/ring\/c\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (!m?.[1]) return { ok: false, reason: "no-address" };
  const secret = loc.hash.replace(/^#/, "").trim();
  if (!secret) return { ok: false, reason: "no-secret" };
  const seed = seedFromRingSecret(secret);
  if (!seed) return { ok: false, reason: "bad-secret" };
  if (Keypair.fromSeed(seed).publicKey.toBase58() !== m[1]) return { ok: false, reason: "mismatch" };
  return { ok: true, address: m[1], seed };
}

/** Accepts a pasted full link (for apps that strip the fragment on open). */
export function parsePastedRingLink(text: string): ParsedRingLink {
  try {
    const u = new URL(text.trim());
    return parseRingLink({ pathname: u.pathname, hash: u.hash });
  } catch {
    return { ok: false, reason: "no-address" };
  }
}
