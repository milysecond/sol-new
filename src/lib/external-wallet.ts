/**
 * Browser-injected Solana wallets (Phantom, Solflare, Backpack, etc.).
 * Optional path alongside passkey wallets — never required.
 */
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBase58(): string };
  }>;
  disconnect?: () => Promise<void>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAndSendTransaction?: (
    tx: Transaction | VersionedTransaction,
  ) => Promise<{ signature: string } | string>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getInjectedProvider(): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const candidates = [
    w.phantom?.solana,
    w.solflare,
    w.backpack,
    w.solana,
  ].filter(Boolean) as InjectedSolanaProvider[];

  // Prefer known wallets that are actually providers
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

export async function connectInjectedWallet(): Promise<{
  publicKey: string;
  label: string;
}> {
  const p = getInjectedProvider();
  if (!p) {
    throw new Error(
      "No browser wallet found. Install Phantom or Solflare, or use a sol.new passkey wallet.",
    );
  }
  const res = await p.connect();
  const publicKey = res.publicKey?.toBase58?.() || p.publicKey?.toBase58?.();
  if (!publicKey) throw new Error("Wallet connected but no address returned");
  return { publicKey, label: injectedWalletLabel(p) };
}

export async function signTransactionWithInjected<
  T extends Transaction | VersionedTransaction,
>(tx: T): Promise<T> {
  const p = getInjectedProvider();
  if (!p) throw new Error("Browser wallet disconnected. Reconnect and try again.");
  return p.signTransaction(tx);
}
