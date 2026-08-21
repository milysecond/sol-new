/**
 * Privacy Cash (Groth16 ZK pool) — browser only.
 * Uses Function('return import(m)') so Next/OpenNext cannot statically
 * bundle privacycash / @lightprotocol/hasher.rs into the CF Worker.
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

if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (!w.Buffer) w.Buffer = Buffer;
  if (!w.process) w.process = nodeProcess;
  if (!w.global) w.global = window;
}

/** Escape static analysis — packages load only in the browser at runtime. */
// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

export const PRIVACY_CASH_KEY_BASE = "/circuit2/transaction2";
export const PRIVACY_CASH_SIGN_MSG = "Privacy Money account sign in";
const FIRST_FETCH_NOTES = 60_000;

export type PrivacyCashSession = {
  keypair: Keypair;
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
  if (typeof window === "undefined") {
    throw new Error("ZK privacy runs in the browser only");
  }
  const { keypair } = await getPasskeyKeypair();
  const [{ EncryptionService, setLogger }, { WasmFactory }, nacl] = await Promise.all([
    dynamicImport("privacycash/utils"),
    dynamicImport("@lightprotocol/hasher.rs"),
    dynamicImport("tweetnacl"),
  ]);
  setLogger(() => {});
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
  const { getUtxos, getBalanceFromUtxos } = await dynamicImport("privacycash/utils");
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
  const utils = await dynamicImport("privacycash/utils");
  if (onStatus) utils.setLogger((_l: string, message: string) => onStatus(message));
  const res = await utils.deposit({
    lightWasm: session.hasher,
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

export async function privateSendSol(
  session: PrivacyCashSession,
  lamports: number,
  recipient: PublicKey | string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const utils = await dynamicImport("privacycash/utils");
  if (onStatus) utils.setLogger((_l: string, message: string) => onStatus(message));
  const to = typeof recipient === "string" ? new PublicKey(recipient) : recipient;
  const res = await utils.withdraw({
    lightWasm: session.hasher,
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
