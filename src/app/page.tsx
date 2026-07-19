"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { FaucetFooter } from "@/components/faucet-footer";
import { MailingListSignup } from "@/components/mailing-list-signup";
import { Coins, Image, Wallet, ShieldCheck, ArrowRight, Sparkles, Users, Newspaper, Headphones, ChevronDown, X, ExternalLink, HandCoins, Gift, Trophy } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { WelcomeProvider } from "@/components/welcome-message";
import { StatsBar } from "@/components/stats-bar";
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
  const [isTg, setIsTg] = useState(false);

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

  return (
    <div className="mt-3 flex flex-col items-center gap-2 w-full max-w-xs mx-auto">
      <button
        onClick={() => connect("My Wallet")}
        disabled={loading}
        className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-purple-400/60 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed text-base"
      >
        {loading ? (
          <><Spinner size={16} className="inline mr-2" />Setting up…</>
        ) : (
          "Create my wallet"
        )}
      </button>
      <p className="text-[11px] text-gray-500 dark:text-white/40 text-center px-1 flex items-center gap-1 justify-center">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Secured by Face ID — no seed phrases
      </p>
      <button
        type="button"
        onClick={() => recover()}
        disabled={loading}
        className="text-xs text-gray-400 dark:text-white/30 hover:text-purple-500 dark:hover:text-purple-400 transition cursor-pointer disabled:opacity-40 mt-2"
      >
        I already have a wallet →
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
        const data = d as { tokens?: typeof latest[]; total?: number };
        setLatest(data?.tokens?.[0] ?? null);
        setTotal(typeof data?.total === "number" ? data.total : null);
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

// Same order as the mobile nav: your money, make things, share it, play.
const products: { href: string; icon: LucideIcon; title: string; desc: string; color: string }[] = [
  { href: "/wallet", icon: Wallet, title: "Wallet", desc: "Get SOL, send, manage", color: "text-fuchsia-400" },
  { href: "/token", icon: Coins, title: "Token", desc: "Launch your own coin", color: "text-orange-400" },
  { href: "/gift", icon: Gift, title: "Gift", desc: "Send crypto with a link", color: "text-amber-400" },
  { href: "/punt", icon: Trophy, title: "Punt", desc: "World Cup odds & picks", color: "text-green-400" },
];

function NextStepBanner() {
  const { balance } = useWallet();
  // Show only when wallet is connected but unfunded
  if (balance === null || balance > 0.001) return null;
  return (
    <Link
      href="/get"
      className="group flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-purple-400/50 bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 hover:from-purple-500/25 hover:to-fuchsia-500/25 transition-all duration-150 active:scale-[0.99] animate-pulse-soft"
    >
      <div className="w-11 h-11 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
        <HandCoins className="w-6 h-6 text-purple-500 dark:text-purple-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-purple-500 dark:text-purple-300 font-semibold">Next step</div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white">Add SOL to start creating</div>
        <div className="text-[11px] text-gray-500 dark:text-white/50">Use Apple Pay, Google Pay, or a friend</div>
      </div>
      <ArrowRight className="w-5 h-5 text-purple-500 dark:text-purple-300 group-hover:translate-x-0.5 transition-transform shrink-0" />
    </Link>
  );
}

type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image: string | null;
};

const SOURCE_COLOR: Record<string, string> = {
  Cointelegraph: "text-yellow-500 bg-yellow-500/10",
  Decrypt: "text-sky-500 bg-sky-500/10",
  "The Defiant": "text-fuchsia-500 bg-fuchsia-500/10",
};

function newsAgo(iso: string): string {
  if (!iso) return "";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NewsWidget() {
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sol.new.news.dismissed") === "1";
  });
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    if (dismissed) return;
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => setItems(((d as { items?: NewsItem[] }).items ?? []).slice(0, 5)))
      .catch(() => setItems([]));
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-500/5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <Newspaper className="w-4 h-4 text-sky-500 shrink-0" />
        <span className="text-sm font-semibold flex-1 text-gray-900 dark:text-white">News</span>
        <a
          href="/news"
          className="text-[11px] text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition mr-1"
        >
          See all
        </a>
        <button
          onClick={() => setMinimized((m) => !m)}
          className="p-0.5 rounded text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 transition"
          aria-label={minimized ? "Expand" : "Collapse"}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${minimized ? "" : "rotate-180"}`} />
        </button>
        <button
          onClick={() => { setDismissed(true); localStorage.setItem("sol.new.news.dismissed", "1"); }}
          className="p-0.5 rounded text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 transition"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!minimized && (
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {items === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded bg-black/5 dark:bg-white/10 w-3/4" />
                    <div className="h-2.5 rounded bg-black/5 dark:bg-white/5 w-1/3" />
                  </div>
                </div>
              ))
            : items.length === 0
            ? (
                <div className="px-4 py-4 text-xs text-gray-400 dark:text-white/30 text-center">
                  Couldn&apos;t load news right now.
                </div>
              )
            : items.map((n, i) => (
                <a
                  key={`${n.link}-${i}`}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 px-4 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition text-gray-900 dark:text-white">
                      {n.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLOR[n.source] ?? "text-gray-500 bg-black/5 dark:bg-white/10"}`}>
                        {n.source}
                      </span>
                      {n.pubDate && <span className="text-[11px] text-gray-400 dark:text-white/30">{newsAgo(n.pubDate)}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-white/20 group-hover:text-sky-400 transition shrink-0 mt-0.5" />
                </a>
              ))
          }
        </div>
      )}
    </div>
  );
}

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
        <div className="w-full sm:max-w-lg md:max-w-2xl lg:max-w-5xl xl:max-w-6xl flex flex-col gap-3 sm:gap-4 md:gap-5 py-3 lg:py-8">
          {/* Header */}
          <div className="text-center space-y-2 lg:space-y-3">
            <img src="/icon-512.png" alt="sol.new" className="w-14 h-14 lg:w-16 lg:h-16 mx-auto rounded-xl electrify" />
            <h1 className="hidden lg:block text-3xl xl:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              Create anything on <span className="text-purple-400">Solana</span>
            </h1>
            <p className="text-gray-500 dark:text-white/50 text-sm lg:text-base">
              <span className="lg:hidden">Create anything on Solana. </span>Instant and low fees.
            </p>
            <StatsBar />
            {!publicKey && (
              <GetStarted connect={connect} recover={recover} loading={loading} />
            )}
          </div>

          {/* Two columns on desktop: products left, feed right */}
          <div className="flex flex-col gap-3 sm:gap-4 md:gap-5 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 lg:items-start">
            <div className="flex flex-col gap-3 sm:gap-4 md:gap-5">
              {/* Next-step nudge for funded-zero wallets */}
              {publicKey && <NextStepBanner />}

              {/* Product grid — 2x2, scales up with viewport */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                {products.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="group flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 py-6 sm:py-10 md:py-14 lg:py-12 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:scale-95 active:bg-purple-500/10 border border-black/10 dark:border-white/10 hover:border-purple-400/30 rounded-2xl transition-all duration-150"
                  >
                    <AnimatedIcon
                      icon={p.icon}
                      size={24}
                      className={`${p.color} [&_svg]:w-7 [&_svg]:h-7 sm:[&_svg]:w-10 sm:[&_svg]:h-10 md:[&_svg]:w-12 md:[&_svg]:h-12`}
                    />
                    <div className="text-sm sm:text-lg md:text-xl font-semibold text-gray-900 dark:text-white transition">{p.title}</div>
                    <div className="text-[11px] sm:text-sm md:text-base text-gray-500 dark:text-white/40 px-2 text-center leading-tight">{p.desc}</div>
                  </Link>
                ))}
              </div>

              {/* Secondary tools — reachable on every device */}
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                {[
                  { href: "/nft", icon: Image, label: "NFT", desc: "Image to NFT", color: "text-green-400" },
                  { href: "/multisig", icon: ShieldCheck, label: "Multisig", desc: "Shared wallet", color: "text-blue-400" },
                  { href: "/pay", icon: HandCoins, label: "Pay", desc: "Request money", color: "text-teal-400" },
                  { href: "/split", icon: Users, label: "Split", desc: "Split a bill", color: "text-purple-400" },
                  { href: "/news", icon: Newspaper, label: "News", desc: "Latest headlines", color: "text-sky-400" },
                  { href: "/pods", icon: Headphones, label: "Pods", desc: "Crypto podcasts", color: "text-fuchsia-400" },
                ].map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="group flex flex-col items-center justify-center gap-1.5 py-4 sm:py-5 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:scale-95 border border-black/10 dark:border-white/10 hover:border-purple-400/30 rounded-2xl transition-all duration-150"
                  >
                    <t.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${t.color}`} />
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.label}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-white/40 leading-tight text-center px-1">{t.desc}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:gap-4 md:gap-5 lg:sticky lg:top-20">
              {/* Inline news feed */}
              <NewsWidget />

              <MailingListSignup source="home" />

              {/* What's new banner — leads the sidebar on desktop */}
              <div className="contents lg:block lg:-order-1">
                <WhatsNewBanner />
              </div>
            </div>
          </div>

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
