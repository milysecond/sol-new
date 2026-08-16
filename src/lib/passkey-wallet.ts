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
function rememberCredential(address: string, rawId: ArrayBuffer) {
  try {
    const credentialId = bytesToCredId(rawId);
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]") as {
      pubkey: string;
      credentialId?: string;
      label?: string;
    }[];
    const idx = wallets.findIndex((w) => w.pubkey === address);
    if (idx >= 0) {
      wallets[idx].credentialId = credentialId;
      wallets[idx].label = address;
    } else {
      wallets.push({ pubkey: address, credentialId, label: address });
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
 * iOS Safari throws "The document is not focused" if a drag control or
 * blurred tab still holds activation after slide-to-send.
 */
export function ensureDocumentFocusForPasskey() {
  try {
    if (typeof document === "undefined") return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && typeof ae.blur === "function" && ae !== document.body) {
      ae.blur();
    }
    window.focus?.();
    // Nudge layout so Safari treats the document as focused after pointer-up
    void document.body?.offsetHeight;
  } catch {
    /* ignore */
  }
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(data) as unknown as BufferSource);
  return new Uint8Array(hash);
}

export async function createPasskeyWallet(_username?: string): Promise<{
  publicKey: string;
  credentialId: string;
  userId: string;
}> {
  ensureDocumentFocusForPasskey();
  // Provisional WebAuthn name until we derive the Solana address
  const provisional = `sol.new-${Date.now().toString(36)}`;
  // Stable random user handle — needed later to rename the passkey in the browser via Signal API
  const userIdBytes = crypto.getRandomValues(new Uint8Array(32));
  const userId = btoa(String.fromCharCode(...userIdBytes));

  const excludeCredentials = listKnownCredentialIds().map((id) => ({
    id: credIdToBytes(id),
    type: "public-key" as const,
    transports: ["internal", "hybrid"] as AuthenticatorTransport[],
  }));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: CHALLENGE,
      rp: { name: "sol.new", id: getRpId() },
      user: {
        id: userIdBytes,
        // Browser passkey list — updated to full address after PRF derive
        name: provisional,
        displayName: "sol.new wallet",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      // Discourage accidental re-enroll of the same authenticator slot when we already know IDs
      ...(excludeCredentials.length ? { excludeCredentials } : {}),
      extensions: {
        prf: {
          eval: {
            first: CHALLENGE,
          },
        },
      },
    },
  })) as PublicKeyCredential;

  if (!credential) throw new Error("Passkey creation cancelled");

  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;

  let seed: Uint8Array;

  if (prfResult) {
    seed = await sha256(new Uint8Array(prfResult));
  } else {
    seed = await sha256(new Uint8Array(credential.rawId));
  }

  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const publicKey = keypair.publicKey.toBase58();
  const credentialId = bytesToCredId(credential.rawId);
  rememberCredential(publicKey, credential.rawId);

  // Wallet name === address (browser passkey list + UI)
  await signalPasskeyUserDetails({
    userId,
    name: publicKey,
    displayName: publicKey,
  });

  return {
    publicKey,
    credentialId,
    userId,
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
}> {
  ensureDocumentFocusForPasskey();
  // Prefer pinned credential unless forcing the full picker (wallet finder).
  const allowCredentials = opts?.forcePicker
    ? undefined
    : getAllowCredentials(opts?.forAddress);

  // Purpose-bound challenge so each switch is a fresh signature (PRF seed still uses CHALLENGE).
  const purpose = opts?.purpose || "unlock";
  const challenge = new TextEncoder().encode(
    `sol.new:${purpose}:${opts?.forAddress || "any"}:${Date.now()}:${crypto.getRandomValues(new Uint8Array(8)).join("")}`,
  );

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: getRpId(),
        userVerification: "required",
        timeout: 120_000,
        ...(allowCredentials && { allowCredentials }),
        extensions: {
          prf: {
            eval: {
              first: CHALLENGE,
            },
          },
        },
      },
    })) as PublicKeyCredential;
  } catch (e) {
    // Pinned credential missing/wrong — retry with full picker when switching to a known address
    if (!opts?.forcePicker && opts?.forAddress) {
      credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: getRpId(),
          userVerification: "required",
          timeout: 120_000,
          extensions: {
            prf: {
              eval: {
                first: CHALLENGE,
              },
            },
          },
        },
      })) as PublicKeyCredential;
    } else {
      throw e;
    }
  }

  if (!credential) throw new Error("Passkey authentication cancelled");

  const credentialId = bytesToCredId(credential.rawId);
  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;

  let seed: Uint8Array;

  if (prfResult) {
    seed = await sha256(new Uint8Array(prfResult));
  } else {
    seed = await sha256(new Uint8Array(credential.rawId));
  }

  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const publicKey = keypair.publicKey.toBase58();
  if (opts?.forAddress && publicKey !== opts.forAddress) {
    throw new Error(
      `That passkey is for ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}, not the selected wallet. Pick the matching passkey.`,
    );
  }
  rememberCredential(publicKey, credential.rawId);

  return {
    publicKey,
    credentialId,
  };
}

/**
 * Prove control of a wallet via passkey (message/challenge sign).
 * Required when switching active accounts.
 */
export async function provePasskeyWallet(address: string): Promise<{
  publicKey: string;
  credentialId: string;
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
}): Promise<{ address: string; keypair: Keypair; credential: PublicKeyCredential }> {
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

  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;
  let seed: Uint8Array;
  if (prfResult) {
    seed = await sha256(new Uint8Array(prfResult));
  } else {
    seed = await sha256(new Uint8Array(credential.rawId));
  }
  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const address = keypair.publicKey.toBase58();
  return { address, keypair, credential };
}

export async function getPasskeyKeypair(
  expectedPublicKey?: string
): Promise<{ address: string; keypair: Keypair }> {
  // 1) Try pinned credential for this wallet
  try {
    const first = await authPasskeyOnce({ forAddress: expectedPublicKey, forcePicker: false });
    if (!expectedPublicKey || first.address === expectedPublicKey) {
      rememberCredential(first.address, first.credential.rawId);
      return { address: first.address, keypair: first.keypair };
    }
  } catch {
    /* pinned missing/wrong — fall through to picker */
  }

  // 2) Full picker — user must pick the passkey that derives expected address
  const second = await authPasskeyOnce({ forcePicker: true });
  if (expectedPublicKey && second.address !== expectedPublicKey) {
    throw new Error(
      `Wrong passkey. Connected wallet is ${expectedPublicKey.slice(0, 4)}…${expectedPublicKey.slice(-4)}, but that passkey is ${second.address.slice(0, 4)}…${second.address.slice(-4)}. Choose the passkey named with your full address.`,
    );
  }
  rememberCredential(second.address, second.credential.rawId);
  return { address: second.address, keypair: second.keypair };
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
