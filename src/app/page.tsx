"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { FaucetFooter } from "@/components/faucet-footer";
import { Coins, Image, Wallet, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { WelcomeProvider, useWelcome } from "@/components/welcome-message";
import type { LucideIcon } from "lucide-react";

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 1200);
    const t2 = setTimeout(onDone, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-white dark:bg-black flex items-center justify-center transition-opacity duration-300 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="text-center space-y-4">
        <img src="/icon-512.png" alt="sol.new" className="w-24 h-24 mx-auto rounded-2xl electrify" />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
          sol<span className="text-purple-400">.new</span>
        </h1>
      </div>
    </div>
  );
}

function isTelegramWebView() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  return ua.includes("TelegramBot") || ua.includes("Telegram") || !!(window as any).TelegramWebviewProxy || !!(window as any).Telegram?.WebApp;
}

function GetStarted({
  connect,
  recover,
  loading,
}: {
  connect: (username?: string) => Promise<void>;
  recover: () => Promise<void>;
  loading: boolean;
}) {
  const [label, setLabel] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [isTg, setIsTg] = useState(false);
  const { show: showWelcome } = useWelcome();

  useEffect(() => { setIsTg(isTelegramWebView()); }, []);

  if (isTg) {
    return (
      <>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/40">Tap the menu button below to open in your browser</p>
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
    );
  }

  if (!showInput) {
    return (
      <button
        onClick={() => { showWelcome(); setShowInput(true); }}
        className="mt-2 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-8 py-3 transition cursor-pointer"
      >
        Get started
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2 w-full max-w-xs mx-auto">
      <input
        type="text"
        placeholder="Name your new wallet (e.g. My Wallet)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        autoFocus
        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition text-sm text-center"
      />
      <button
        onClick={() => label.trim() && connect(label.trim())}
        disabled={loading || !label.trim()}
        className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed"
      >
        {loading ? (
          <><Spinner size={16} className="inline mr-2" />Authenticating...</>
        ) : (
          "Create new wallet"
        )}
      </button>
      <p className="text-[11px] text-gray-500 dark:text-white/40 text-center px-1">
        This creates a <b>brand-new</b> wallet via passkey.
        <br />
        If you already have a sol.new wallet with a balance, recover it instead.
      </p>
      <button
        type="button"
        onClick={() => recover()}
        disabled={loading}
        className="w-full mt-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-sm rounded-xl px-4 py-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Recover existing wallet
      </button>
    </div>
  );
}

function WhatsNewBanner() {
  const { network } = useNetwork();
  const [latest, setLatest] = useState<{ name: string; symbol: string; mint_address: string; image_url: string | null; created_at: string } | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    setLatest(null);
    setTotal(null);
    fetch(`/api/tokens/recent?limit=1&network=${network}`)
      .then((r) => r.json())
      .then((d) => {
        setLatest(d?.tokens?.[0] ?? null);
        setTotal(typeof d?.total === "number" ? d.total : null);
      })
      .catch(() => {});
  }, [network]);

  const networkLabel = network === "devnet" ? "test" : "live";

  return (
    <Link
      href="/whats-new"
      className="group flex items-center gap-3 px-4 py-3 rounded-2xl border border-orange-400/30 bg-gradient-to-r from-orange-500/10 to-amber-500/10 hover:from-orange-500/15 hover:to-amber-500/15 transition-all duration-150 active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        {latest?.image_url ? (
          <img
            src={latest.image_url}
            alt=""
            className="w-11 h-11 rounded-lg object-cover ring-1 ring-orange-400/40"
          />
        ) : (
          <div className="w-11 h-11 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-orange-400" />
          </div>
        )}
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-400 ring-2 ring-white dark:ring-black animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold">What's new</span>
          {total != null && (
            <span className="text-[10px] text-gray-400 dark:text-white/40">{total.toLocaleString()} {networkLabel} launched</span>
          )}
        </div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {latest ? (
            <>
              {latest.name} <span className="text-gray-400 dark:text-white/40 font-mono text-xs">${latest.symbol}</span>
            </>
          ) : (
            "See recent launches"
          )}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-orange-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
    </Link>
  );
}

const products: { href: string; icon: LucideIcon; title: string; desc: string; color: string }[] = [
  { href: "/token", icon: Coins, title: "Token", desc: "Launch a token in seconds", color: "text-orange-400" },
  { href: "/nft", icon: Image, title: "NFT", desc: "Mint an NFT from any image", color: "text-green-400" },
  { href: "/multisig", icon: ShieldCheck, title: "Multisig", desc: "Create a multisig", color: "text-blue-400" },
  { href: "/wallet", icon: Wallet, title: "Wallet", desc: "Get SOL, pay, and manage assets", color: "text-fuchsia-400" },
];

export default function Home() {
  const { publicKey, connect, recover, loading } = useWallet();
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("sol.new.splashed");
  });

  return (
    <WelcomeProvider>
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      {showSplash && <SplashScreen onDone={() => { setShowSplash(false); sessionStorage.setItem("sol.new.splashed", "1"); }} />}
      <Navbar />
      <main className="flex-1 flex flex-col px-3 sm:px-6 sm:items-center sm:justify-center min-h-0">
        <PageTransition>
        <div className="w-full sm:max-w-lg flex flex-col gap-3 py-3">
          {/* Header */}
          <div className="text-center space-y-2">
            <img src="/icon-512.png" alt="sol.new" className="w-14 h-14 mx-auto rounded-xl electrify" />
            <p className="text-gray-500 dark:text-white/50 text-sm">
              Create anything on Solana. Instant and low fees.
            </p>
            {!publicKey && (
              <GetStarted connect={connect} recover={recover} loading={loading} />
            )}
          </div>

          {/* Product grid — 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group flex flex-col items-center justify-center gap-2 py-6 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:scale-95 active:bg-purple-500/10 border border-black/10 dark:border-white/10 hover:border-purple-400/30 rounded-2xl transition-all duration-150"
              >
                <AnimatedIcon icon={p.icon} size={24} className={p.color} />
                <div className="text-sm font-semibold text-gray-900 dark:text-white transition">{p.title}</div>
                <div className="text-[11px] text-gray-500 dark:text-white/40 px-2 text-center leading-tight">{p.desc}</div>
              </Link>
            ))}
          </div>

          {/* What's new banner */}
          <WhatsNewBanner />

          {/* Footer row */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-white/30">
              <span>Zero installs</span>
              <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              <span>Zero friction</span>
              <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
              <span>Zero wait time</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <a href="https://x.com/soldotnew" target="_blank" className="flex items-center gap-1.5 text-gray-400 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition text-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              @soldotnew
            </a>
            <span className="w-1 h-1 rounded-full bg-black/10 dark:bg-white/10" />
            <a href="https://t.me/soldotnew" target="_blank" className="flex items-center gap-1.5 text-gray-400 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition text-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Telegram
            </a>
          </div>
        </div>
        </PageTransition>
      </main>
      <FaucetFooter />
    </div>
    </WelcomeProvider>
  );
}
