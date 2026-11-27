"use client";

import { useWallet } from "@/lib/wallet-context";

/**
 * Audit H1/C1: wallets made by the old credential-ID fallback ("rawid-legacy")
 * still unlock so funds can be moved, but their key is weak. Tell the owner to
 * move funds to a new (PRF) wallet. Never switches seeds automatically.
 */
export function LegacyWalletNotice() {
  const { publicKey, wallets, connect, loading } = useWallet();
  if (!publicKey) return null;
  const entry = wallets.find((w) => w.pubkey === publicKey);
  if (entry?.derivation !== "rawid-legacy") return null;
  return (
    <div
      role="alert"
      className="mx-auto my-2 w-full max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <strong>Move your funds to a new wallet.</strong> This wallet{" "}
      ({publicKey.slice(0, 4)}…{publicKey.slice(-4)}) was made with an older,
      weaker passkey setup. Create a new wallet, then switch back to this one and
      send everything to the new address.{" "}
      <button
        type="button"
        disabled={loading}
        onClick={() => void connect({ createNew: true })}
        className="ml-1 underline font-medium disabled:opacity-50"
      >
        Create new wallet
      </button>
    </div>
  );
}
