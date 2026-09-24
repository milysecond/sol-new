/**
 * Sign + send with the connected wallet: passkey Face ID or Phantom / Solflare / etc.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export async function sendUserTransaction(
  tx: Transaction,
  opts: {
    publicKey: string;
    walletKind: "passkey" | "external";
    connection: Connection;
    extraSigners?: Keypair[];
  },
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await opts.connection.getLatestBlockhash("confirmed");
  tx.feePayer = new PublicKey(opts.publicKey);
  tx.recentBlockhash = blockhash;
  opts.extraSigners?.forEach((k) => tx.partialSign(k));

  if (opts.walletKind === "external") {
    const { signAndSendWithExternal, signTransactionWithInjected } = await import(
      "@/lib/external-wallet"
    );
    const sent = await signAndSendWithExternal(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });
    if (sent) {
      await opts.connection
        .confirmTransaction({ signature: sent, blockhash, lastValidBlockHeight }, "confirmed")
        .catch(() => {});
      return sent;
    }
    const signed = await signTransactionWithInjected(tx);
    const sig = await opts.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await opts.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return sig;
  }

  const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
  const { keypair } = await getPasskeyKeypair(opts.publicKey);
  tx.partialSign(keypair);
  const sig = await opts.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await opts.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

export async function signUserVersionedB64(
  serializedTx: string,
  opts: { publicKey: string; walletKind: "passkey" | "external" },
): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(serializedTx, "base64"));
  if (opts.walletKind === "external") {
    const { signTransactionWithInjected } = await import("@/lib/external-wallet");
    const signed = await signTransactionWithInjected(tx);
    return Buffer.from(signed.serialize()).toString("base64");
  }
  const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
  const { keypair } = await getPasskeyKeypair(opts.publicKey);
  tx.sign([keypair]);
  return Buffer.from(tx.serialize()).toString("base64");
}

export async function signUserTxB64(
  serializedTx: string,
  opts: { publicKey: string; walletKind: "passkey" | "external" },
): Promise<string> {
  try {
    return await signUserVersionedB64(serializedTx, opts);
  } catch {
    const tx = Transaction.from(Buffer.from(serializedTx, "base64"));
    if (opts.walletKind === "external") {
      const { signTransactionWithInjected } = await import("@/lib/external-wallet");
      const signed = await signTransactionWithInjected(tx);
      return Buffer.from(signed.serialize()).toString("base64");
    }
    const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
    const { keypair } = await getPasskeyKeypair(opts.publicKey);
    tx.partialSign(keypair);
    return Buffer.from(tx.serialize()).toString("base64");
  }
}

export async function signAndSendUserVersioned(
  serializedTx: string,
  rpc: string,
  opts: { publicKey: string; walletKind: "passkey" | "external" },
): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(serializedTx, "base64"));
  if (opts.walletKind === "external") {
    const { signAndSendWithExternal, signTransactionWithInjected } = await import(
      "@/lib/external-wallet"
    );
    const sent = await signAndSendWithExternal(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });
    if (sent) return sent;
    const signed = await signTransactionWithInjected(tx);
    const conn = new Connection(rpc, "confirmed");
    return conn.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  }
  const { signVersionedAndSend } = await import("@/lib/passkey-wallet");
  return signVersionedAndSend(serializedTx, rpc, opts.publicKey);
}
