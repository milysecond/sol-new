// @ts-nocheck — WebAuthn PRF extension types are incomplete
import { Keypair, Transaction, VersionedTransaction, Connection } from "@solana/web3.js";

const CHALLENGE = new TextEncoder().encode("sol.new-wallet-creation");

/** Prefer apex sol.new so www/preview hosts do not mint separate passkey silos. */
export function getRpId(): string {
  if (typeof window === "undefined") return "sol.new";
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return host;
  if (host === "sol.new" || host.endsWith(".sol.new")) return "sol.new";
  return host;
}

function credIdToBytes(credentialId: string): Uint8Array {
  // Support both standard base64 and base64url
  const b64 = credentialId.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToCredId(rawId: ArrayBuffer | Uint8Array): string {
  const bytes = rawId instanceof Uint8Array ? rawId : new Uint8Array(rawId);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function listKnownCredentialIds(): string[] {
  const ids: string[] = [];
  try {
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]") as {
      credentialId?: string;
    }[];
    for (const w of wallets) {
      if (w.credentialId && !ids.includes(w.credentialId)) ids.push(w.credentialId);
    }
  } catch { /* ignore */ }
  try {
    const g = localStorage.getItem("sol.new.credentialId");
    if (g && !ids.includes(g)) ids.push(g);
  } catch { /* ignore */ }
  return ids;
}



/**
 * Resolve which credential to allow for auth prompts.
 * Always prefer the credential bound to `forAddress` (connected wallet).
 * Never fall back to a different wallet's credentialId.
 */
function getAllowCredentials(forAddress?: string | null) {
  const pubkey = forAddress || (typeof localStorage !== "undefined" ? localStorage.getItem("sol.new.wallet") : null);
  try {
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]") as {
      pubkey?: string;
      credentialId?: string;
    }[];
    if (pubkey) {
      const fromList = wallets.find((w) => w.pubkey === pubkey)?.credentialId;
      if (fromList) {
        return [
          {
            id: credIdToBytes(fromList),
            type: "public-key" as const,
            transports: ["internal", "hybrid"] as AuthenticatorTransport[],
          },
        ];
      }
    }
  } catch {
    /* ignore */
  }
  // Global credential only if it belongs to the same active wallet
  try {
    const active = localStorage.getItem("sol.new.wallet");
    const credId = localStorage.getItem("sol.new.credentialId");
    if (credId && pubkey && active === pubkey) {
      return [
        {
          id: credIdToBytes(credId),
          type: "public-key" as const,
          transports: ["internal", "hybrid"] as AuthenticatorTransport[],
        },
      ];
    }
  } catch {
    /* ignore */
  }
  // No pin → browser may list passkeys; caller must verify derived address
  return undefined;
}

/**
 * Persist the (address ↔ credential) pairing learned from a successful auth,
 * so the next prompt can pin to the right passkey instead of listing them all.
 */
function rememberCredential(
  address: string,
  rawId: ArrayBuffer,
  derivation?: WalletDerivation,
) {
  try {
    const credentialId = bytesToCredId(rawId);
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]") as {
      pubkey: string;
      credentialId?: string;
      label?: string;
      derivation?: WalletDerivation;
    }[];
    const idx = wallets.findIndex((w) => w.pubkey === address);
    if (idx >= 0) {
      wallets[idx].credentialId = credentialId;
      wallets[idx].label = address;
      if (derivation) wallets[idx].derivation = derivation;
    } else {
      wallets.push({
        pubkey: address,
        credentialId,
        label: address,
        ...(derivation ? { derivation } : {}),
      });
    }
    localStorage.setItem("sol.new.wallets", JSON.stringify(wallets));
    // Keep active session credential in sync when this is the connected wallet
    if (localStorage.getItem("sol.new.wallet") === address) {
      localStorage.setItem("sol.new.credentialId", credentialId);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Call immediately before navigator.credentials.get/create.
 * Do NOT await delays before WebAuthn — Android loses user activation.
 */
export function ensureDocumentFocusForPasskey() {
  try {
    if (typeof document === "undefined") return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && typeof ae.blur === "function" && ae !== document.body) {
      ae.blur();
    }
    window.focus?.();
  } catch {
    /* ignore */
  }
}

function isAndroidUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

/** Hard cap so loading UI never spins forever when OS swallows the prompt. */
async function withWebAuthnTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `${label} timed out. Close any system dialog, then tap try again.`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data) as unknown as BufferSource,
  );
  return new Uint8Array(hash);
}

/**
 * How a wallet's Ed25519 seed is derived from its passkey (audit H1).
 * - "prf-v1": SHA-256(PRF(salt "sol.new-wallet-creation")). Required for all new wallets.
 * - "rawid-legacy": SHA-256(credential rawId). Old fallback; weak (audit C1).
 *   Still unlockable so users can move funds out, never created anymore.
 */
export type WalletDerivation = "prf-v1" | "rawid-legacy";

export const PRF_REQUIRED_MESSAGE =
  "This browser didn't return your passkey's secure key (PRF), so sol.new can't open the wallet safely here. Use Safari on iPhone/iPad/Mac (iOS 18+) or Chrome on Android/desktop, with your Apple or Google passkey.";

export class PrfRequiredError extends Error {
  constructor(message = PRF_REQUIRED_MESSAGE) {
    super(message);
    this.name = "PrfRequiredError";
  }
}

type DerivedWallet = {
  keypair: Keypair;
  address: string;
  derivation: WalletDerivation;
};

type StoredWalletRecord = {
  pubkey?: string;
  credentialId?: string;
  derivation?: WalletDerivation;
};

function storedWallets(): StoredWalletRecord[] {
  try {
    return JSON.parse(localStorage.getItem("sol.new.wallets") || "[]") as StoredWalletRecord[];
  } catch {
    return [];
  }
}

/** Recorded derivation mode for a wallet address on this device, if any. */
export function getWalletDerivation(address?: string | null): WalletDerivation | undefined {
  if (!address) return undefined;
  return storedWallets().find((w) => w.pubkey === address)?.derivation;
}

/** Ask the server which of these addresses are known sol.new wallets. */
async function knownWallets(addresses: string[]): Promise<Record<string, boolean>> {
  try {
    const qs = addresses.map((a) => `pk=${encodeURIComponent(a)}`).join("&");
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ac?.abort(), 5000);
    const r = await fetch(`/api/wallet?${qs}`, {
      cache: "no-store",
      ...(ac ? { signal: ac.signal } : {}),
    });
    clearTimeout(t);
    if (!r.ok) return {};
    const j = (await r.json()) as { found?: Record<string, boolean> };
    return j.found || {};
  } catch {
    return {};
  }
}

/**
 * Pick the seed for an assertion without ever silently switching modes.
 * - Pinned address: use whichever mode reproduces it (PRF first).
 * - Recorded mode on this device: use it; a prf-v1 wallet never falls back to rawId.
 * - Unknown: PRF wallet, unless the rawId address is an already-registered
 *   sol.new wallet (legacy) and the PRF address is not.
 * - No PRF and not a known legacy wallet: refuse (PrfRequiredError).
 */
async function deriveFromAssertion(
  credential: PublicKeyCredential,
  expectedAddress?: string | null,
): Promise<DerivedWallet & { mismatch?: boolean }> {
  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;
  let prfWallet: DerivedWallet | null = null;
  if (prfResult) {
    const kp = Keypair.fromSeed((await sha256(new Uint8Array(prfResult))).slice(0, 32));
    prfWallet = { keypair: kp, address: kp.publicKey.toBase58(), derivation: "prf-v1" };
  }
  const rawKp = Keypair.fromSeed(
    (await sha256(new Uint8Array(credential.rawId))).slice(0, 32),
  );
  const rawWallet: DerivedWallet = {
    keypair: rawKp,
    address: rawKp.publicKey.toBase58(),
    derivation: "rawid-legacy",
  };

  // Zero the candidate we don't use.
  const keep = (w: DerivedWallet): DerivedWallet => {
    if (w !== rawWallet) rawWallet.keypair.secretKey.fill(0);
    if (prfWallet && w !== prfWallet) prfWallet.keypair.secretKey.fill(0);
    return w;
  };

  if (expectedAddress) {
    if (prfWallet && prfWallet.address === expectedAddress) return keep(prfWallet);
    if (rawWallet.address === expectedAddress) return keep(rawWallet);
    if (!prfWallet && getWalletDerivation(expectedAddress) !== "rawid-legacy") {
      // Expected wallet is (or may be) PRF-derived, but this browser gave no PRF.
      throw new PrfRequiredError();
    }
    return { ...keep(prfWallet || rawWallet), mismatch: true };
  }

  const credId = bytesToCredId(credential.rawId);
  const recorded = storedWallets().find(
    (w) => w.credentialId === credId && w.derivation && w.pubkey,
  );
  if (recorded?.derivation === "prf-v1") {
    if (!prfWallet) throw new PrfRequiredError();
    return keep(prfWallet);
  }
  if (recorded?.derivation === "rawid-legacy" && recorded.pubkey === rawWallet.address) {
    return keep(rawWallet);
  }
  const localPubkeys = new Set(storedWallets().map((w) => w.pubkey));
  if (prfWallet) {
    if (localPubkeys.has(prfWallet.address)) return keep(prfWallet);
    if (localPubkeys.has(rawWallet.address)) return keep(rawWallet);
    const found = await knownWallets([prfWallet.address, rawWallet.address]);
    if (!found[prfWallet.address] && found[rawWallet.address]) return keep(rawWallet);
    return keep(prfWallet);
  }
  if (localPubkeys.has(rawWallet.address)) return keep(rawWallet);
  const found = await knownWallets([rawWallet.address]);
  if (found[rawWallet.address]) return keep(rawWallet);
  throw new PrfRequiredError();
}

export async function createPasskeyWallet(_username?: string): Promise<{
  publicKey: string;
  credentialId: string;
  userId: string;
  derivation: WalletDerivation;
}> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("Passkeys are not supported in this browser.");
  }

  // CRITICAL: no await/setTimeout before credentials.create — keeps user gesture on Android
  ensureDocumentFocusForPasskey();

  const provisional = `sol.new-${Date.now().toString(36)}`;
  const userIdBytes = crypto.getRandomValues(new Uint8Array(32));
  const userId = btoa(String.fromCharCode(...userIdBytes));

  const excludeCredentials = listKnownCredentialIds().map((id) => ({
    id: credIdToBytes(id),
    type: "public-key" as const,
    transports: ["internal", "hybrid"] as AuthenticatorTransport[],
  }));

  const android = isAndroidUa();
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: CHALLENGE,
    rp: { name: "sol.new", id: getRpId() },
    user: {
      id: userIdBytes,
      name: provisional,
      displayName: "sol.new wallet",
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },
      { alg: -257, type: "public-key" },
    ],
    authenticatorSelection: android
      ? {
          // Android PWAs often hang or no-op with platform-only attachment
          residentKey: "preferred",
          requireResidentKey: false,
          userVerification: "required",
        }
      : {
          authenticatorAttachment: "platform",
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
    timeout: 90_000,
    ...(excludeCredentials.length ? { excludeCredentials } : {}),
    extensions: {
      prf: {
        eval: {
          first: CHALLENGE,
        },
      },
    },
  };

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await withWebAuthnTimeout(
      navigator.credentials.create({
        publicKey: publicKeyOptions,
        ...(ac ? { signal: ac.signal } : {}),
      }) as Promise<PublicKeyCredential | null>,
      95_000,
      "Passkey create",
    )) as PublicKeyCredential | null;
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message.toLowerCase() : "";
    // One immediate retry with looser options (still same call stack after catch is OK if prompt never opened)
    const retryable =
      msg.includes("not allowed") ||
      msg.includes("not supported") ||
      msg.includes("security") ||
      msg.includes("invalid") ||
      msg.includes("unknown");
    if (!retryable || msg.includes("timed out") || msg.includes("abort")) {
      throw firstErr;
    }
    ensureDocumentFocusForPasskey();
    const loose: PublicKeyCredentialCreationOptions = {
      ...publicKeyOptions,
      authenticatorSelection: {
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "preferred",
      },
    };
    credential = (await withWebAuthnTimeout(
      navigator.credentials.create({
        publicKey: loose,
      }) as Promise<PublicKeyCredential | null>,
      95_000,
      "Passkey create",
    )) as PublicKeyCredential | null;
  }

  if (!credential) throw new Error("Passkey creation cancelled");

  let prfResult = credential.getClientExtensionResults()?.prf?.results?.first;

  // PRF is REQUIRED for new wallets (audit H1). Many authenticators only
  // return PRF output on get(), not create(), so ask once more for this exact
  // passkey. Never fall back to the credential ID (audit C1).
  if (!prfResult) {
    try {
      ensureDocumentFocusForPasskey();
      const assertion = (await withWebAuthnTimeout(
        navigator.credentials.get({
          publicKey: {
            challenge: CHALLENGE,
            rpId: getRpId(),
            userVerification: "required",
            timeout: 90_000,
            allowCredentials: [
              {
                id: new Uint8Array(credential.rawId),
                type: "public-key" as const,
                transports: ["internal", "hybrid"] as AuthenticatorTransport[],
              },
            ],
            extensions: { prf: { eval: { first: CHALLENGE } } },
          },
        }) as Promise<PublicKeyCredential | null>,
        95_000,
        "Passkey unlock",
      )) as PublicKeyCredential | null;
      prfResult = assertion?.getClientExtensionResults()?.prf?.results?.first;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Passkey made, but one more Face ID step is needed to finish. Tap "Unlock wallet" to continue. (${msg})`,
      );
    }
  }
  if (!prfResult) {
    throw new PrfRequiredError();
  }

  const seed = await sha256(new Uint8Array(prfResult));
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  seed.fill(0);
  const publicKey = keypair.publicKey.toBase58();
  const credentialId = bytesToCredId(credential.rawId);
  rememberCredential(publicKey, credential.rawId, "prf-v1");

  try {
    localStorage.setItem("sol.new.wallet", publicKey);
    localStorage.setItem("sol.new.walletLabel", publicKey);
    localStorage.setItem("sol.new.credentialId", credentialId);
  } catch {
    /* ignore */
  }

  // Fire-and-forget rename — never block wallet activation on Signal API
  void signalPasskeyUserDetails({
    userId,
    name: publicKey,
    displayName: publicKey,
  });

  return {
    publicKey,
    credentialId,
    userId,
    derivation: "prf-v1",
  };
}

/** Update browser passkey account name when supported (Chrome). */
export async function signalPasskeyUserDetails(opts: {
  userId: string;
  name: string;
  displayName: string;
}): Promise<boolean> {
  try {
    const PK = PublicKeyCredential as unknown as {
      signalCurrentUserDetails?: (o: {
        rpId: string;
        userId: BufferSource;
        name: string;
        displayName: string;
      }) => Promise<void>;
    };
    if (typeof PK.signalCurrentUserDetails !== "function") return false;
    const raw = Uint8Array.from(atob(opts.userId), (c) => c.charCodeAt(0));
    await PK.signalCurrentUserDetails({
      rpId: getRpId(),
      userId: raw,
      name: opts.name.slice(0, 64),
      displayName: opts.displayName.slice(0, 64),
    });
    return true;
  } catch {
    return false;
  }
}

export async function recoverPasskeyWallet(opts?: {
  /** Always show the system passkey picker (ignore pinned credential). */
  forcePicker?: boolean;
  /** Pin to this wallet's saved credential when known. */
  forAddress?: string;
  /**
   * Purpose of this auth (shown only in our errors; WebAuthn challenge is purpose-bound).
   * Default: unlock. Use "switch" when changing active wallet.
   */
  purpose?: "unlock" | "switch" | "identify";
}): Promise<{
  publicKey: string;
  credentialId: string;
  derivation: WalletDerivation;
}> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("Passkeys are not supported in this browser.");
  }
  // No delay — preserve user gesture
  ensureDocumentFocusForPasskey();

  const allowCredentials = opts?.forcePicker
    ? undefined
    : getAllowCredentials(opts?.forAddress);

  const purpose = opts?.purpose || "unlock";
  const challenge = new TextEncoder().encode(
    `sol.new:${purpose}:${opts?.forAddress || "any"}:${Date.now()}:${crypto.getRandomValues(new Uint8Array(8)).join("")}`,
  );

  const getOpts = (withAllow: boolean): PublicKeyCredentialRequestOptions => ({
    challenge,
    rpId: getRpId(),
    userVerification: "required",
    timeout: 90_000,
    ...(withAllow && allowCredentials ? { allowCredentials } : {}),
    extensions: {
      prf: {
        eval: {
          first: CHALLENGE,
        },
      },
    },
  });

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await withWebAuthnTimeout(
      navigator.credentials.get({
        publicKey: getOpts(true),
      }) as Promise<PublicKeyCredential | null>,
      95_000,
      "Passkey unlock",
    )) as PublicKeyCredential | null;
  } catch (e) {
    if (!opts?.forcePicker && opts?.forAddress) {
      credential = (await withWebAuthnTimeout(
        navigator.credentials.get({
          publicKey: getOpts(false),
        }) as Promise<PublicKeyCredential | null>,
        95_000,
        "Passkey unlock",
      )) as PublicKeyCredential | null;
    } else {
      throw e;
    }
  }

  if (!credential) throw new Error("Passkey authentication cancelled");

  const credentialId = bytesToCredId(credential.rawId);
  const derived = await deriveFromAssertion(credential, opts?.forAddress);
  const publicKey = derived.address;
  derived.keypair.secretKey.fill(0);
  if (derived.mismatch) {
    throw new Error(
      `That passkey is for ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}, not the selected wallet. Pick the matching passkey.`,
    );
  }
  rememberCredential(publicKey, credential.rawId, derived.derivation);

  return {
    publicKey,
    credentialId,
    derivation: derived.derivation,
  };
}

/**
 * Prove control of a wallet via passkey (message/challenge sign).
 * Required when switching active accounts.
 */
export async function provePasskeyWallet(address: string): Promise<{
  publicKey: string;
  credentialId: string;
  derivation: WalletDerivation;
}> {
  const a = address.trim();
  if (!a) throw new Error("Missing wallet address");
  // Try pinned credential first; recoverPasskeyWallet falls back to picker
  return recoverPasskeyWallet({
    forAddress: a,
    forcePicker: false,
    purpose: "switch",
  });
}

/** Open the full passkey list and reveal the Solana address for the chosen one. */
export async function identifyPasskeyWallet(): Promise<{
  publicKey: string;
  credentialId: string;
  derivation: WalletDerivation;
}> {
  return recoverPasskeyWallet({ forcePicker: true });
}

/**
 * Get the current wallet address and keypair by authenticating with passkey.
 * Use this to verify address before creating transactions.
 * Returns both to avoid double authentication.
 */
async function authPasskeyOnce(opts?: {
  forAddress?: string | null;
  forcePicker?: boolean;
}): Promise<{
  address: string;
  keypair: Keypair;
  credential: PublicKeyCredential;
  derivation: WalletDerivation;
  mismatch?: boolean;
}> {
  ensureDocumentFocusForPasskey();
  const allowCredentials = opts?.forcePicker
    ? undefined
    : getAllowCredentials(opts?.forAddress);

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
      rpId: getRpId(),
      userVerification: "required",
      ...(allowCredentials && { allowCredentials }),
      extensions: {
        prf: {
          eval: {
            first: CHALLENGE,
          },
        },
      },
    },
    // Prefer conditional UI only when not forcing a full list
  })) as PublicKeyCredential;

  if (!credential) throw new Error("Passkey authentication cancelled");

  const derived = await deriveFromAssertion(credential, opts?.forAddress);
  return {
    address: derived.address,
    keypair: derived.keypair,
    credential,
    derivation: derived.derivation,
    mismatch: derived.mismatch,
  };
}

export async function getPasskeyKeypair(
  expectedPublicKey?: string
): Promise<{ address: string; keypair: Keypair }> {
  const isUserCancel = (e: unknown) => {
    const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
    const msg = (e instanceof Error ? e.message : String(e || "")).toLowerCase();
    return (
      name === "NotAllowedError" ||
      name === "AbortError" ||
      msg.includes("notallowed") ||
      msg.includes("cancel") ||
      msg.includes("denied") ||
      msg.includes("abort") ||
      msg.includes("timed out") ||
      msg.includes("the operation either timed out")
    );
  };

  // 1) Try pinned credential for this wallet
  try {
    const first = await authPasskeyOnce({ forAddress: expectedPublicKey, forcePicker: false });
    if (!expectedPublicKey || first.address === expectedPublicKey) {
      rememberCredential(first.address, first.credential.rawId, first.derivation);
      return { address: first.address, keypair: first.keypair };
    }
    // Wrong passkey for pinned path — ask user to pick the right one
  } catch (e) {
    // User cancelled / denied — STOP. Do not open a second prompt.
    if (isUserCancel(e) || e instanceof PrfRequiredError) {
      throw e instanceof Error
        ? e
        : new Error("Passkey authentication cancelled");
    }
    /* pinned missing/broken — fall through to picker */
  }

  // 2) Full picker — user must pick the passkey that derives expected address
  try {
    const second = await authPasskeyOnce({
      forAddress: expectedPublicKey,
      forcePicker: true,
    });
    if (expectedPublicKey && second.address !== expectedPublicKey) {
      throw new Error(
        `Wrong passkey. Connected wallet is ${expectedPublicKey.slice(0, 4)}…${expectedPublicKey.slice(-4)}, but that passkey is ${second.address.slice(0, 4)}…${second.address.slice(-4)}. Choose the passkey named with your full address.`,
      );
    }
    rememberCredential(second.address, second.credential.rawId, second.derivation);
    return { address: second.address, keypair: second.keypair };
  } catch (e) {
    if (isUserCancel(e)) {
      throw new Error("Passkey authentication cancelled. Gift was not sent.");
    }
    throw e;
  }
}

/**
 * Sign and send a pre-built transaction with the given keypair.
 * No authentication needed - keypair is already derived.
 */
export async function signAndSendWithKeypair(
  serializedTx: string,
  rpc: string,
  keypair: Keypair
): Promise<string> {
  const tx = Transaction.from(Buffer.from(serializedTx, "base64"));
  
  // Get fresh blockhash before signing
  const conn = new Connection(rpc, "confirmed");
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  
  tx.partialSign(keypair);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  
  await conn.confirmTransaction({
    signature: sig,
    blockhash,
    lastValidBlockHeight,
  }, "confirmed");
  
  return sig;
}

/**
 * Sign and send a transaction using the passkey-derived keypair.
 * Re-authenticates with passkey to derive the secret key.
 * Gets a fresh blockhash before sending to avoid expiration.
 */
export async function signAndSendTransaction(
  serializedTx: string,
  rpc: string,
  expectedPublicKey?: string
): Promise<string> {
  const { keypair } = await getPasskeyKeypair(expectedPublicKey);
  return signAndSendWithKeypair(serializedTx, rpc, keypair);
}

/**
 * Sign a fee-payer-pre-signed VersionedTransaction with an already-derived keypair.
 * No second Face ID — pair with getPasskeyKeypair(publicKey) first.
 */
export async function signVersionedWithKeypairAndSend(
  serializedTx: string,
  rpc: string,
  keypair: Keypair,
  expectedPublicKey?: string,
): Promise<string> {
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) {
    throw new Error(
      `Passkey mismatch: expected ${expectedPublicKey.slice(0, 4)}…, got ${keypair.publicKey.toBase58().slice(0, 4)}…`
    );
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(serializedTx, "base64"));
  tx.sign([keypair]);

  const conn = new Connection(rpc, "confirmed");
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  } catch (e: unknown) {
    const anyE = e as {
      message?: string;
      logs?: string[];
      getLogs?: () => Promise<string[]>;
    };
    let logs: string[] | undefined = anyE.logs;
    try {
      if (!logs && typeof anyE.getLogs === "function") {
        logs = await anyE.getLogs();
      }
    } catch {
      /* ignore */
    }
    const tail = logs?.slice(-6).join(" · ");
    const base = anyE.message || String(e);
    throw new Error(tail ? `${base} — ${tail}` : base);
  }
}

/**
 * Sign a server-built, fee-payer-pre-signed VersionedTransaction with the
 * user's passkey-derived keypair and submit it. Preserves existing signatures
 * (i.e. the fee payer's) — does NOT re-fetch a blockhash, since changing the
 * blockhash here would invalidate the fee payer's signature.
 */
export async function signVersionedAndSend(
  serializedTx: string,
  rpc: string,
  expectedPublicKey?: string,
): Promise<string> {
  const { keypair } = await getPasskeyKeypair(expectedPublicKey);
  return signVersionedWithKeypairAndSend(
    serializedTx,
    rpc,
    keypair,
    expectedPublicKey,
  );
}
