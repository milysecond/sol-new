/**
 * Privacy Cash (Groth16 ZK) — loads prebundled browser build from /zk/
 * so Next never packs WASM into the Cloudflare Worker.
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

export const PRIVACY_CASH_KEY_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/circuit2/transaction2`
    : "/circuit2/transaction2";
export const PRIVACY_CASH_SIGN_MSG = "Privacy Money account sign in";
const FIRST_FETCH_NOTES = 60_000;

export type PrivacyNetwork = "mainnet" | "devnet";

const BUNDLES: Record<PrivacyNetwork, string> = {
  mainnet: "/zk/privacycash.js",
  devnet: "/zk/privacycash-devnet.js",
};

const RELAYER_ROOT: Record<PrivacyNetwork, string> = {
  mainnet: "https://api3.privacycash.org",
  // Overridable at runtime for local/tunnel relayers
  devnet:
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_RELAYER_API_URL_DEVNET) ||
    "",
};

export type PrivacyCashSession = {
  keypair: Keypair;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encryptionService: any;
  hasher: unknown;
  connection: Connection;
  network: PrivacyNetwork;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrivacyCashUtils = any;

const utilsCache = new Map<PrivacyNetwork, Promise<PrivacyCashUtils>>();

function resolveDevnetRelayer(): string {
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem("solnew.pc.devnetRelayer");
    if (fromLs) return fromLs.replace(/\/$/, "");
  }
  return (RELAYER_ROOT.devnet || "").replace(/\/$/, "");
}

export function setDevnetRelayerUrl(url: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("solnew.pc.devnetRelayer", url.replace(/\/$/, ""));
  }
}

export function getDevnetRelayerUrl(): string {
  return resolveDevnetRelayer();
}

export function isPrivacyCashAvailable(network: PrivacyNetwork): boolean {
  if (network === "mainnet") return true;
  return Boolean(resolveDevnetRelayer());
}

async function loadPrivacyUtils(network: PrivacyNetwork): Promise<PrivacyCashUtils> {
  if (typeof window === "undefined") {
    throw new Error("ZK privacy runs in the browser only");
  }
  if (network === "devnet" && !resolveDevnetRelayer()) {
    throw new Error(
      "Devnet Privacy Cash relayer not configured. Set localStorage solnew.pc.devnetRelayer",
    );
  }
  let p = utilsCache.get(network);
  if (!p) {
    const path = BUNDLES[network];
    const href = new URL(path, window.location.origin).href;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const dyn = new Function("u", "return import(u)") as (u: string) => Promise<PrivacyCashUtils>;
    p = dyn(href).catch((e) => {
      utilsCache.delete(network);
      throw e;
    });
    utilsCache.set(network, p);
  }
  return p;
}

export async function getUtxoOffset(network: PrivacyNetwork = "mainnet"): Promise<number> {
  try {
    const base =
      network === "devnet" ? resolveDevnetRelayer() : RELAYER_ROOT.mainnet;
    if (!base) return 0;
    const res = await fetch(`${base}/merkle/root?token=sol`);
    const j = (await res.json()) as { nextIndex?: number };
    if (typeof j.nextIndex === "number" && j.nextIndex > FIRST_FETCH_NOTES) {
      return j.nextIndex - FIRST_FETCH_NOTES;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export async function openPrivacyCashSession(
  rpc: string,
  network: PrivacyNetwork = "mainnet",
): Promise<PrivacyCashSession> {
  if (typeof window === "undefined") {
    throw new Error("ZK privacy runs in the browser only");
  }
  const { keypair } = await getPasskeyKeypair();
  const [utils, nacl] = await Promise.all([
    loadPrivacyUtils(network),
    import("tweetnacl"),
  ]);
  const { EncryptionService, setLogger, WasmFactory } = utils;
  if (!EncryptionService || !WasmFactory) {
    throw new Error("Privacy Cash bundle incomplete — hard refresh and try again.");
  }
  setLogger?.(() => {});
  const signature = nacl.default.sign.detached(
    new TextEncoder().encode(PRIVACY_CASH_SIGN_MSG),
    keypair.secretKey,
  );
  const encryptionService = new EncryptionService();
  encryptionService.deriveEncryptionKeyFromSignature(signature);
  const hasher = await WasmFactory.getInstance();
  const connection = new Connection(rpc, "confirmed");
  return { keypair, encryptionService, hasher, connection, network };
}

export async function getPrivateSolBalance(session: PrivacyCashSession): Promise<number> {
  const { getUtxos, getBalanceFromUtxos } = await loadPrivacyUtils(session.network);
  const offset = await getUtxoOffset(session.network);
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
  const utils = await loadPrivacyUtils(session.network);
  if (onStatus) utils.setLogger?.((_l: string, message: string) => onStatus(message));
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

export async function privateSendSol(
  session: PrivacyCashSession,
  lamports: number,
  recipient: PublicKey | string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const utils = await loadPrivacyUtils(session.network);
  if (onStatus) utils.setLogger?.((_l: string, message: string) => onStatus(message));
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
