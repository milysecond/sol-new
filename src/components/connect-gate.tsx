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
 */
export function ConnectGate({
  children,
  action,
}: {
  children: React.ReactNode;
  action: string;
}) {
  const { publicKey, walletLabel, wallets, connect, recover, switchWallet, loading, error } =
    useWallet();
  const [username, setUsername] = useState("");
  const [isTgWebView, setIsTgWebView] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setIsTgWebView(isTelegramWebView());
  }, []);

  // Already in wallet-context session — use it (no second connect stack)
  if (publicKey) return <>{children}</>;

  const hasSaved = wallets.length > 0;

  const handleConnect = () => {
    if (!username.trim()) return;
    void connect(username.trim());
  };

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
                    : "Create a passkey wallet with Face ID or fingerprint."}
                </p>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-left">
                    {error}
                  </div>
                )}

                {/* Saved wallets from this device */}
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
                              switchWallet(w.pubkey);
                            }}
                            className="w-full flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 px-3 py-2.5 text-left hover:border-purple-400/40 disabled:opacity-50"
                          >
                            <Wallet className="w-4 h-4 text-purple-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {w.label || short(w.pubkey)}
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
                  onClick={() => void recover()}
                  disabled={loading}
                  className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
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

                {!showCreate ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    disabled={loading}
                    className="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
                  >
                    Create a new wallet
                  </button>
                ) : (
                  <div className="space-y-2 pt-1 border-t border-black/5 dark:border-white/10">
                    <input
                      type="text"
                      placeholder="Wallet label (e.g. My Main Wallet)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={loading || !username.trim()}
                      className="w-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 font-semibold rounded-xl px-4 py-3 transition text-sm cursor-pointer disabled:opacity-40"
                    >
                      {loading ? "Creating…" : "Create passkey wallet"}
                    </button>
                  </div>
                )}

                {walletLabel && (
                  <p className="text-[11px] text-gray-400">Last used: {walletLabel}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
