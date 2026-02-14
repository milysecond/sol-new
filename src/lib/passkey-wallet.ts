// @ts-nocheck — WebAuthn PRF extension types are incomplete
import { Keypair, Transaction, Connection } from "@solana/web3.js";

const CHALLENGE = new TextEncoder().encode("sol.new-wallet-creation");

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(data) as unknown as BufferSource);
  return new Uint8Array(hash);
}

export async function createPasskeyWallet(username: string): Promise<{
  publicKey: string;
  credentialId: string;
}> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: CHALLENGE,
      rp: { name: "sol.new", id: window.location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: username || "sol.new user",
        displayName: username || "sol.new user",
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
  const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

  return {
    publicKey: keypair.publicKey.toBase58(),
    credentialId,
  };
}

export async function recoverPasskeyWallet(): Promise<{
  publicKey: string;
}> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: CHALLENGE,
      userVerification: "required",
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

  return {
    publicKey: keypair.publicKey.toBase58(),
  };
}

/**
 * Get the current wallet address and keypair by authenticating with passkey.
 * Use this to verify address before creating transactions.
 * Returns both to avoid double authentication.
 */
export async function getPasskeyKeypair(): Promise<{address: string, keypair: Keypair}> {
  const storedCredId = localStorage.getItem("sol.new.credentialId");
  const allowCredentials = storedCredId 
    ? [{ id: Uint8Array.from(atob(storedCredId), c => c.charCodeAt(0)), type: "public-key" as const }]
    : undefined;

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
  return {
    address: keypair.publicKey.toBase58(),
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
  // Get stored credentialId to ensure we use the right passkey
  const storedCredId = localStorage.getItem("sol.new.credentialId");
  const allowCredentials = storedCredId 
    ? [{ id: Uint8Array.from(atob(storedCredId), c => c.charCodeAt(0)), type: "public-key" as const }]
    : undefined;

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
