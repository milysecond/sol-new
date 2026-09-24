/**
 * Helius Rings (devnet). Loads prebundled /zk/helius-rings.js so Next never
 * packs @solana/kit or zolana into the Cloudflare Worker.
 */
"use client";

import { Buffer } from "buffer";
import {
  Connection,
  VersionedTransaction,
  type Keypair,
} from "@solana/web3.js";
import nacl from "tweetnacl";

const BUNDLE = "/zk/helius-rings.js";
const DERIVE_MSG = "TSPP/derive/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RingsSdk = any;

let sdkPromise: Promise<RingsSdk> | null = null;

function absRpc(rpc: string): string {
  if (rpc.startsWith("http")) return rpc;
  if (typeof window === "undefined") return rpc;
  return new URL(rpc, window.location.origin).href;
}

export async function loadRingsSdk(): Promise<RingsSdk> {
  if (typeof window === "undefined") {
    throw new Error("Rings run in the browser only");
  }
  if (!sdkPromise) {
    const href = new URL(BUNDLE, window.location.origin).href;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const dyn = new Function("u", "return import(u)") as (u: string) => Promise<RingsSdk>;
    sdkPromise = dyn(href).catch((e) => {
      sdkPromise = null;
      throw e;
    });
  }
  return sdkPromise;
}

export async function listRingPrograms(rpc: string): Promise<{ programId: string; paused: boolean }[]> {
  const z = await loadRingsSdk();
  const client = await z.createZolanaClient({ solanaRpcUrl: absRpc(rpc) });
  const list = await z.listRegisteredRings(client);
  return (list || []).map((r: { programId: string; paused: boolean }) => ({
    programId: String(r.programId),
    paused: Boolean(r.paused),
  }));
}

function wireToVersioned(kitTx: unknown, z: RingsSdk): VersionedTransaction {
  try {
    const b64 = z.getBase64EncodedWireTransaction(kitTx);
    return VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  } catch {
    const bytes = z.getTransactionEncoder().encode(kitTx);
    return VersionedTransaction.deserialize(Buffer.from(bytes));
  }
}

export async function depositSolToRing(opts: {
  rpc: string;
  keypair: Keypair;
  amountLamports: bigint;
}): Promise<string> {
  const z = await loadRingsSdk();
  const owner = opts.keypair.publicKey.toBase58();
  const client = await z.createZolanaClient({ solanaRpcUrl: absRpc(opts.rpc) });
  const seed = nacl.sign.detached(new TextEncoder().encode(DERIVE_MSG), opts.keypair.secretKey);
  const keys = z.LocalKeys.fromDerivationSeed(
    { solanaPublicKey: owner, derivationSeed: seed },
    client.proofService,
  );
  const registered = await z.isWalletRegistered({ rpc: client, owner });
  if (!registered) {
    const regTx = await z.buildRegistrationTransaction({
      client,
      owner,
      address: keys.address(),
    });
    if (regTx) {
      const vtx = wireToVersioned(regTx, z);
      vtx.sign([opts.keypair]);
      const conn = new Connection(opts.rpc.startsWith("http") ? opts.rpc : absRpc(opts.rpc), "confirmed");
      const sig = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction(sig, "confirmed");
    }
  }
  const rings = await z.listRegisteredRings(client);
  const live = (rings || []).find((r: { paused: boolean }) => !r.paused) || rings?.[0];
  if (!live) throw new Error("No Helius Ring registered on this cluster yet");
  const kitTx = await z.buildRingDepositTransaction({
    client,
    ringProgramId: live.programId,
    feePayer: owner,
    recipient: owner,
    amount: opts.amountLamports,
  });
  const vtx = wireToVersioned(kitTx, z);
  vtx.sign([opts.keypair]);
  const conn = new Connection(opts.rpc.startsWith("http") ? opts.rpc : absRpc(opts.rpc), "confirmed");
  const sig = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction(sig, "confirmed");
  keys.destroy?.();
  return sig;
}
