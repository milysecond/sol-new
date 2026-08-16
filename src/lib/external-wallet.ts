/**
 * External wallet bridge — ConnectorKit + legacy inject fallback.
 * Module-level registration so wallet-context / pay / gift can call without hooks.
 */
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

type AnyTx = Transaction | VersionedTransaction;

type OpenPicker = () => void;
type SignTx = <T extends AnyTx>(tx: T) => Promise<T>;
type DisconnectExt = () => Promise<void> | void;

let openPickerFn: OpenPicker | null = null;
let signTxFn: SignTx | null = null;
let disconnectFn: DisconnectExt | null = null;

export function registerWalletPicker(fn: OpenPicker | null) {
  openPickerFn = fn;
}

export function registerExternalSigner(fn: SignTx | null) {
  signTxFn = fn;
}

export function registerExternalDisconnect(fn: DisconnectExt | null) {
  disconnectFn = fn;
}

/** Open multi-wallet picker (ConnectorKit). */
export function openWalletPicker() {
  if (openPickerFn) {
    openPickerFn();
    return;
  }
  throw new Error("Wallet picker not ready. Refresh and try again.");
}

export async function disconnectExternalWallet() {
  try {
    await disconnectFn?.();
  } catch {
    /* ignore */
  }
}

/** Legacy inject detection (fallback when ConnectorKit has no session). */
export type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBase58(): string };
  }>;
  disconnect?: () => Promise<void>;
  signTransaction: <T extends AnyTx>(tx: T) => Promise<T>;
  signAndSendTransaction?: (
    tx: AnyTx,
  ) => Promise<{ signature: string } | string>;
};

export function getInjectedProvider(): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const candidates = [
    w.phantom?.solana,
    w.solflare,
    w.backpack,
    w.glowSolana,
    w.coinbaseSolana,
    w.solana,
  ].filter(Boolean) as InjectedSolanaProvider[];

  for (const p of candidates) {
    if (p && typeof p.connect === "function" && typeof p.signTransaction === "function") {
      return p;
    }
  }
  return null;
}

export function injectedWalletLabel(p: InjectedSolanaProvider | null): string {
  if (!p) return "Browser wallet";
  if (p.isPhantom) return "Phantom";
  if (p.isSolflare) return "Solflare";
  if (p.isBackpack) return "Backpack";
  return "Browser wallet";
}

export function hasInjectedWallet(): boolean {
  return Boolean(getInjectedProvider());
}

/** Prefer ConnectorKit signer; fall back to window.solana inject. */
export async function signTransactionWithInjected<T extends AnyTx>(tx: T): Promise<T> {
  if (signTxFn) {
    return signTxFn(tx);
  }
  const p = getInjectedProvider();
  if (!p) {
    throw new Error("Browser wallet disconnected. Reconnect and try again.");
  }
  return p.signTransaction(tx);
}

/** @deprecated Use openWalletPicker + ConnectorKit. Kept for fallback. */
export async function connectInjectedWallet(): Promise<{
  publicKey: string;
  label: string;
}> {
  // Prefer picker when available
  if (openPickerFn) {
    openPickerFn();
    throw new Error("PICKER_OPENED");
  }
  const p = getInjectedProvider();
  if (!p) {
    throw new Error(
      "No browser wallet found. Install Phantom, Solflare, Backpack, or another Solana wallet.",
    );
  }
  const res = await p.connect();
  const publicKey = res.publicKey?.toBase58?.() || p.publicKey?.toBase58?.();
  if (!publicKey) throw new Error("Wallet connected but no address returned");
  return { publicKey, label: injectedWalletLabel(p) };
}
