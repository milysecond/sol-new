// @ts-nocheck — WebAuthn PRF extension types are incomplete
import { Keypair, Transaction, VersionedTransaction, Connection } from "@solana/web3.js";

const CHALLENGE = new TextEncoder().encode("sol.new-wallet-creation");

/**
 * Resolve which credential to allow for auth prompts. Prefers the active
 * credentialId; falls back to the saved wallet list keyed by the connected
 * address (heals sessions from before credentialId tracking existed, where
 * the browser would otherwise list every sol.new passkey on the device).
 */
function getAllowCredentials(forAddress?: string | null) {
  let credId = localStorage.getItem("sol.new.credentialId");
  try {
    const pubkey = forAddress || localStorage.getItem("sol.new.wallet");
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]");
    if (pubkey) {
      const fromList = wallets.find((w: { pubkey?: string }) => w.pubkey === pubkey)?.credentialId;
      if (fromList) credId = fromList;
    }
  } catch {}
  return credId
    ? [{ id: Uint8Array.from(atob(credId), (c) => c.charCodeAt(0)), type: "public-key" as const }]
    : undefined;
}

/**
 * Persist the (address ↔ credential) pairing learned from a successful auth,
 * so the next prompt can pin to the right passkey instead of listing them all.
 */
function rememberCredential(address: string, rawId: ArrayBuffer) {
  try {
    const credentialId = btoa(String.fromCharCode(...new Uint8Array(rawId)));
    const wallets = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]");
    const idx = wallets.findIndex((w) => w.pubkey === address);
    if (idx >= 0) {
      if (!wallets[idx].credentialId) wallets[idx].credentialId = credentialId;
    } else {
      wallets.push({ pubkey: address, credentialId, label: `Wallet ${address.slice(0, 4)}…${address.slice(-4)}` });
    }
    localStorage.setItem("sol.new.wallets", JSON.stringify(wallets));
    if (localStorage.getItem("sol.new.wallet") === address && !localStorage.getItem("sol.new.credentialId")) {
      localStorage.setItem("sol.new.credentialId", credentialId);
    }
  } catch {}
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

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: CHALLENGE,
      rp: { name: "sol.new", id: window.location.hostname },
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
        userVerification: "required",
      },
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
  const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

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
      rpId: window.location.hostname,
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
}): Promise<{
  publicKey: string;
  credentialId: string;
}> {
  ensureDocumentFocusForPasskey();
  // Prefer pinned credential unless forcing the full picker (wallet finder).
  const allowCredentials = opts?.forcePicker
    ? undefined
    : getAllowCredentials(opts?.forAddress);
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
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
  })) as PublicKeyCredential;

  if (!credential) throw new Error("Passkey authentication cancelled");

  const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;

  let seed: Uint8Array;

  if (prfResult) {
    seed = await sha256(new Uint8Array(prfResult));
  } else {
    seed = await sha256(new Uint8Array(credential.rawId));
  }

  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  const publicKey = keypair.publicKey.toBase58();
  rememberCredential(publicKey, credential.rawId);

  return {
    publicKey,
    credentialId,
  };
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
export async function getPasskeyKeypair(
  expectedPublicKey?: string
): Promise<{ address: string; keypair: Keypair }> {
  ensureDocumentFocusForPasskey();
  const allowCredentials = getAllowCredentials(expectedPublicKey);

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
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
  rememberCredential(address, credential.rawId);
  if (expectedPublicKey && address !== expectedPublicKey) {
    throw new Error(
      `Passkey does not match connected wallet (${expectedPublicKey.slice(0, 4)}…${expectedPublicKey.slice(-4)}). Switch wallet in the menu or reconnect.`
    );
  }
  return {
    address,
    keypair,
  };
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
  // Pin the prompt to the right passkey for the connected wallet
  const allowCredentials = getAllowCredentials();

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
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
  rememberCredential(keypair.publicKey.toBase58(), credential.rawId);

  // Verify the derived wallet matches expected
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) {
    throw new Error(`Passkey mismatch: expected ${expectedPublicKey} but got ${keypair.publicKey.toBase58()}`);
  }
  
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
  ensureDocumentFocusForPasskey();
  const allowCredentials = getAllowCredentials(expectedPublicKey);

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
      userVerification: "required",
      ...(allowCredentials && { allowCredentials }),
      extensions: { prf: { eval: { first: CHALLENGE } } },
    },
  })) as PublicKeyCredential;
  if (!credential) throw new Error("Passkey authentication cancelled");

  const prfResult = credential.getClientExtensionResults()?.prf?.results?.first;
  const seed = prfResult
    ? await sha256(new Uint8Array(prfResult))
    : await sha256(new Uint8Array(credential.rawId));

  const keypair = Keypair.fromSeed(seed.slice(0, 32));
  rememberCredential(keypair.publicKey.toBase58(), credential.rawId);
  if (expectedPublicKey && keypair.publicKey.toBase58() !== expectedPublicKey) {
    throw new Error(`Passkey mismatch: expected ${expectedPublicKey}, got ${keypair.publicKey.toBase58()}`);
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(serializedTx, "base64"));
  // VersionedTransaction.sign() only writes to the slots whose pubkey matches
  // a provided signer — fee payer's existing signature is preserved.
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
    // Prefer simulation logs when available
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
