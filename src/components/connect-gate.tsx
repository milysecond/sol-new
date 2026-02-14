"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { Spinner } from "@/components/spinner";
import { PageTransition } from "@/components/page-transition";
import { KeyRound, ExternalLink } from "lucide-react";

function isTelegramWebView() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  return ua.includes("TelegramBot") || ua.includes("Telegram") || !!(window as any).TelegramWebviewProxy || !!(window as any).Telegram?.WebApp;
}

export function ConnectGate({ children, action }: { children: React.ReactNode; action: string }) {
  const { publicKey, connect, recover, loading, error } = useWallet();
  const [username, setUsername] = useState("");
  const [isTgWebView, setIsTgWebView] = useState(false);

  useEffect(() => {
    setIsTgWebView(isTelegramWebView());
  }, []);

  if (publicKey) return <>{children}</>;

  const handleConnect = () => {
    if (!username.trim()) return;
    connect(username.trim());
  };

  return (
    <PageTransition>
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
    <div className="max-w-md w-full mx-auto space-y-4 text-center">
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
              <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 7l5 5 5-5" />
                <path d="M7 13l5 5 5-5" />
              </svg>
            </div>
          </>
        ) : (
          <>
        <p className="text-gray-500 dark:text-white/40 text-sm">
          Create a passkey wallet with Face ID or fingerprint.
        </p>
        
        <input
          type="text"
          placeholder="Wallet label (e.g. My Main Wallet)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition text-sm"
          required
        />
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-left">
            {error}
          </div>
        )}
        <button
          onClick={handleConnect}
          disabled={loading || !username.trim()}
          className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? <><Spinner size={16} className="inline mr-2" />Authenticating...</> : "Connect wallet"}
        </button>
        <button
          onClick={recover}
          disabled={loading}
          className="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
        >
          I already have a passkey wallet
        </button>
          </>
        )}
      </div>
    </div>
    </div>
    </PageTransition>
  );
}
