/**
 * Privacy Cash (Groth16 ZK pool) helpers for sol.new.
 * Mainnet only — pool/indexer/relayer are not on devnet.
 */
"use client";

import { Buffer } from "buffer";
import nodeProcess from "process";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";

// Node globals for snarkjs / hasher wasm (Turbopack skips ProvidePlugin)
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (!w.Buffer) w.Buffer = Buffer;
  if (!w.process) w.process = nodeProcess;
  if (!w.global) w.global = window;
}

export const PRIVACY_CASH_KEY_BASE = "/circuit2/transaction2";
export const PRIVACY_CASH_SIGN_MSG = "Privacy Money account sign in";
const FIRST_FETCH_NOTES = 60_000;

export type PrivacyCashSession = {
  keypair: Keypair;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encryptionService: any;
  hasher: unknown;
  connection: Connection;
};

export async function getUtxoOffset(): Promise<number> {
  try {
    const res = await fetch("https://api3.privacycash.org/merkle/root?token=sol");
    const j = (await res.json()) as { nextIndex?: number };
    if (typeof j.nextIndex === "number" && j.nextIndex > FIRST_FETCH_NOTES) {
      return j.nextIndex - FIRST_FETCH_NOTES;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export async function openPrivacyCashSession(rpc: string): Promise<PrivacyCashSession> {
  const { keypair } = await getPasskeyKeypair();
  const [{ EncryptionService, setLogger }, { WasmFactory }, nacl] = await Promise.all([
    import("privacycash/utils"),
    import("@lightprotocol/hasher.rs"),
    import("tweetnacl"),
  ]);
  setLogger(() => {
    /* quiet by default; UI can set its own logger */
  });
  const signature = nacl.default.sign.detached(
    new TextEncoder().encode(PRIVACY_CASH_SIGN_MSG),
    keypair.secretKey,
  );
  const encryptionService = new EncryptionService();
  encryptionService.deriveEncryptionKeyFromSignature(signature);
  const hasher = await WasmFactory.getInstance();
  const connection = new Connection(rpc, "confirmed");
  return { keypair, encryptionService, hasher, connection };
}

export async function getPrivateSolBalance(session: PrivacyCashSession): Promise<number> {
  const { getUtxos, getBalanceFromUtxos } = await import("privacycash/utils");
  const offset = await getUtxoOffset();
  const utxos = await getUtxos({
    connection: session.connection,
    publicKey: session.keypair.publicKey,
    storage: localStorage,
    encryptionService: session.encryptionService,
    offset,
  });
  return getBalanceFromUtxos(utxos).lamports / LAMPORTS_PER_SOL;
}

export async function shieldSol(
  session: PrivacyCashSession,
  lamports: number,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const utils = await import("privacycash/utils");
  const { setLogger } = utils;
  if (onStatus) setLogger((_level: string, message: string) => onStatus(message));
  const res = await utils.deposit({
    lightWasm: session.hasher as never,
    connection: session.connection,
    publicKey: session.keypair.publicKey,
    storage: localStorage,
    encryptionService: session.encryptionService,
    keyBasePath: PRIVACY_CASH_KEY_BASE,
    amount_in_lamports: lamports,
    transactionSigner: async (t: VersionedTransaction) => {
      t.sign([session.keypair]);
      return t;
    },
  });
  return res.tx;
}

/** ZK private withdraw — breaks on-chain link from your public wallet history. */
export async function privateSendSol(
  session: PrivacyCashSession,
  lamports: number,
  recipient: PublicKey | string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const utils = await import("privacycash/utils");
  const { setLogger } = utils;
  if (onStatus) setLogger((_level: string, message: string) => onStatus(message));
  const to = typeof recipient === "string" ? new PublicKey(recipient) : recipient;
  const res = await utils.withdraw({
    lightWasm: session.hasher as never,
    connection: session.connection,
    publicKey: session.keypair.publicKey,
    storage: localStorage,
    encryptionService: session.encryptionService,
    keyBasePath: PRIVACY_CASH_KEY_BASE,
    amount_in_lamports: lamports,
    recipient: to,
  });
  return res.tx;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
