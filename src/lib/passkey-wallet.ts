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
 * Sign and send a transaction using the passkey-derived keypair.
 * Re-authenticates with passkey to derive the secret key.
 */
export async function signAndSendTransaction(
  serializedTx: string,
  rpc: string,
  additionalSigners?: string[]
): Promise<string> {
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
  const tx = Transaction.from(Buffer.from(serializedTx, "base64"));
  
  tx.partialSign(keypair);

  const conn = new Connection(rpc);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig);
  return sig;
}
