"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { Spinner } from "@/components/spinner";
import { PageTransition } from "@/components/page-transition";
import { KeyRound, Wallet } from "lucide-react";

function isTelegramWebView() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    ua.includes("TelegramBot") ||
    ua.includes("Telegram") ||
    !!(window as unknown as { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy ||
    !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp
  );
}

function short(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/**
 * Gate actions behind the shared wallet-context session.
 * Prefers existing passkeys / saved wallets over "create new".
 * Wallets can have a custom label; address stays the same.
 */
export function ConnectGate({
  children,
  action,
}: {
  children: React.ReactNode;
  action: string;
}) {
  const { publicKey, walletLabel, wallets, connect, recover, switchWallet, loading, error, clearLoading, connectExternal } =
    useWallet();
  const [isTgWebView, setIsTgWebView] = useState(false);

  useEffect(() => {
    setIsTgWebView(isTelegramWebView());
  }, []);

  // Already in wallet-context session — use it (no second connect stack)
  if (publicKey) return <>{children}</>;

  const hasSaved = wallets.length > 0;

  return (
    <PageTransition>
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <div className="max-w-md w-full mx-auto space-y-4 text-center px-1">
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
            <KeyRound className="w-8 h-8 text-purple-400 mx-auto" />
            <h2 className="text-lg font-semibold">Connect to {action}</h2>

            {isTgWebView ? (
              <>
                <p className="text-gray-500 dark:text-white/40 text-sm">
                  Passkeys require a full browser. Tap the menu button below to open in your browser.
                </p>
                <div className="fixed bottom-24 right-6 flex flex-col items-center gap-1 animate-bounce z-50">
                  <p className="text-sm font-medium text-purple-400 bg-black/5 dark:bg-white/10 backdrop-blur rounded-lg px-3 py-1.5">
                    Open in browser
                  </p>
                  <svg
                    className="w-8 h-8 text-purple-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7l5 5 5-5" />
                    <path d="M7 13l5 5 5-5" />
                  </svg>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-500 dark:text-white/40 text-sm">
                  {hasSaved
                    ? "Use your existing sol.new passkey wallet — same one as everywhere else."
                    : "Create a passkey wallet with Face ID or fingerprint. Name = your address."}
                </p>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-left">
                    {error}
                  </div>
                )}

                {hasSaved && (
                  <div className="space-y-2 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Saved on this device
                    </p>
                    <ul className="space-y-1.5">
                      {wallets.map((w) => (
                        <li key={w.pubkey}>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              void switchWallet(w.pubkey);
                            }}
                            className="w-full flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 px-3 py-2.5 text-left hover:border-purple-400/40 disabled:opacity-50"
                          >
                            <Wallet className="w-4 h-4 text-purple-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-mono font-medium truncate" title={w.pubkey}>
                                {w.pubkey}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400">{short(w.pubkey)}</p>
                            </div>
                            <span className="text-xs font-semibold text-purple-500">Use</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void recover({ forcePicker: true })}
                  disabled={loading}
                  className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Spinner size={16} className="inline mr-2" />
                      Authenticating…
                    </>
                  ) : hasSaved ? (
                    "Unlock with passkey"
                  ) : (
                    "I already have a passkey wallet"
                  )}
                </button>

                {loading && (
                  <button
                    type="button"
                    onClick={() => clearLoading()}
                    className="w-full text-sm font-medium text-amber-600 dark:text-amber-300 py-2"
                  >
                    Cancel — prompt stuck?
                  </button>
                )}

                <a
                  href="/wallet/find"
                  className="block w-full text-center text-sm font-medium text-purple-600 dark:text-purple-400 py-1"
                >
                  Many passkeys? Find correct wallet →
                </a>

                <button
                  type="button"
                  onClick={() => void connect({ createNew: true })}
                  disabled={loading}
                  className={`w-full font-semibold rounded-lg px-3.5 py-2.5 transition text-sm cursor-pointer disabled:opacity-40 ${
                    hasSaved
                      ? "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70"
                      : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/25 ring-2 ring-violet-400/40 animate-pulse"
                  }`}
                >
                  {loading
                    ? "…"
                    : hasSaved
                      ? "Create a new passkey wallet (only if needed)"
                      : "✨ Create a new passkey wallet"}
                </button>
                {!hasSaved && (
                  <p className="text-[11px] text-violet-600 dark:text-violet-300 font-medium -mt-1">
                    New here? Tap above — Face ID / fingerprint, no seed phrase.
                  </p>
                )}

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-black/10 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-wide">
                    <span className="bg-white dark:bg-black px-2 text-gray-400">or</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void connectExternal()}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-800 dark:text-white/80 font-semibold rounded-lg px-3.5 py-2.5 transition text-sm cursor-pointer disabled:opacity-40"
                >
                  <Wallet className="w-4 h-4 text-violet-500" />
                  Connect Phantom / Solflare / other wallets
                </button>
                <p className="text-[11px] text-gray-400 dark:text-white/35 leading-relaxed">
                  Opens a wallet picker (Wallet Standard via ConnectorKit). Use funds already in
                  Phantom, Solflare, Backpack, Glow, OKX, and more.
                </p>

                {walletLabel && (
                  <p className="text-[11px] font-mono text-gray-400 truncate" title={walletLabel}>
                    Last used: {walletLabel}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
