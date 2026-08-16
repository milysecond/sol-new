/**
 * External wallet bridge — ConnectorKit + legacy inject fallback.
 * Module-level registration so wallet-context / pay / gift can call without hooks.
 */
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

type AnyTx = Transaction | VersionedTransaction;

type OpenPicker = () => void;
type SignTx = <T extends AnyTx>(tx: T) => Promise<T>;
type SignAndSend = (tx: AnyTx) => Promise<string>;
type DisconnectExt = () => Promise<void> | void;

let openPickerFn: OpenPicker | null = null;
let signTxFn: SignTx | null = null;
let signAndSendFn: SignAndSend | null = null;
let disconnectFn: DisconnectExt | null = null;

export function registerWalletPicker(fn: OpenPicker | null) {
  openPickerFn = fn;
}

export function registerExternalSigner(fn: SignTx | null) {
  signTxFn = fn;
}

export function registerExternalSignAndSend(fn: SignAndSend | null) {
  signAndSendFn = fn;
}

export function registerExternalDisconnect(fn: DisconnectExt | null) {
  disconnectFn = fn;
}

export function hasConnectorSigner(): boolean {
  return Boolean(signTxFn || signAndSendFn);
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
    opts?: { skipPreflight?: boolean; maxRetries?: number },
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

export function hasExternalWalletSession(): boolean {
  return hasConnectorSigner() || Boolean(getInjectedProvider()?.publicKey);
}

function unwrapSig(r: { signature: string } | string): string {
  if (typeof r === "string") return r;
  if (r && typeof r.signature === "string") return r.signature;
  throw new Error("Wallet did not return a transaction signature");
}

/**
 * Sign a legacy web3.js transaction with ConnectorKit or inject.
 * Prefer this when you will sendRawTransaction yourself.
 */
export async function signTransactionWithInjected<T extends AnyTx>(tx: T): Promise<T> {
  const errors: string[] = [];

  if (signTxFn) {
    try {
      return await signTxFn(tx);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const p = getInjectedProvider();
  if (p) {
    try {
      // Ensure wallet is connected
      if (!p.publicKey) {
        await p.connect();
      }
      return await p.signTransaction(tx);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const detail = errors.filter(Boolean).join(" · ") || "no wallet available";
  if (/reject|denied|cancel|notallowed/i.test(detail)) {
    throw new Error("Wallet signature cancelled. Gift was not sent.");
  }
  throw new Error(
    `Could not sign with your browser wallet (${detail}). Reconnect the wallet and try again, or use a passkey wallet.`,
  );
}

/**
 * Sign + send in one step when the wallet supports it (best UX on mobile).
 * Returns signature string, or null if caller should fall back to sign+sendRaw.
 */
export async function signAndSendWithExternal(
  tx: AnyTx,
  opts?: { skipPreflight?: boolean; maxRetries?: number },
): Promise<string | null> {
  if (signAndSendFn) {
    try {
      return await signAndSendFn(tx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|denied|cancel|notallowed/i.test(msg)) {
        throw new Error("Wallet signature cancelled. Gift was not sent.");
      }
      // fall through to inject / manual
    }
  }

  const p = getInjectedProvider();
  if (p?.signAndSendTransaction) {
    try {
      if (!p.publicKey) await p.connect();
      return unwrapSig(await p.signAndSendTransaction(tx, opts));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|denied|cancel|notallowed/i.test(msg)) {
        throw new Error("Wallet signature cancelled. Gift was not sent.");
      }
      // fall through
    }
  }

  return null;
}

/** @deprecated Use openWalletPicker + ConnectorKit. Kept for fallback. */
export async function connectInjectedWallet(): Promise<{
  publicKey: string;
  label: string;
}> {
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
