"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useState, useEffect } from "react";
import { Coins, Image, ShieldCheck, Wallet, Droplets, Zap, ExternalLink, Copy, LogOut, Sparkles, Bell, BellOff, Activity, AtSign, MoreHorizontal, X, Gift, Trophy, HandCoins, Newspaper, Star, Receipt, Dices } from "lucide-react";
import { getPushPermission, subscribePush, unsubscribePush, type PushPermission } from "@/lib/push-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Spinner } from "@/components/spinner";
import type { LucideIcon } from "lucide-react";

/** Full desktop nav (lg+). Order: create → money → tools. */
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/token", label: "Token", icon: Coins },
  { href: "/lists", label: "Lists", icon: Star },
  { href: "/wallet/get", label: "Wallet", icon: Wallet },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/nft", label: "NFT", icon: Image },
  { href: "/scan", label: "Scan", icon: Activity },
  { href: "/whats-new", label: "What's new", icon: Sparkles },
];

/** Compact icon strip for iPad / tablet (md–lg) where full labels crowd the bar. */
const TABLET_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/token", label: "Token", icon: Coins },
  { href: "/lists", label: "Lists", icon: Star },
  { href: "/wallet/get", label: "Wallet", icon: Wallet },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/punt", label: "Punt", icon: Trophy },
  { href: "/scan", label: "Scan", icon: Activity },
];

export function Navbar() {
  const { publicKey, walletLabel, wallets, balance, connect, recover, switchWallet, disconnect, loading, airdropping, airdropDone, handleAirdrop } = useWallet();
  const { network, toggle } = useNetwork();
  const [showMenu, setShowMenu] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setPushPermission(getPushPermission());
  }, [showMenu]);

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;
  const [showMore, setShowMore] = useState(false);

  // Phones: Home · Lists · Wallet · Token · More (thumb zone)
  const MOBILE_PRIMARY = [
    { href: "/", label: "Home", icon: Zap },
    { href: "/lists", label: "Lists", icon: Star },
    { href: "/wallet/get", label: "Wallet", icon: Wallet },
    { href: "/token", label: "Token", icon: Coins },
  ];
  const MOBILE_MORE = [
    { href: "/gift", label: "Gift", icon: Gift },
    { href: "/pay", label: "Pay", icon: HandCoins },
    { href: "/punt", label: "Punt", icon: Trophy },
    { href: "/nft", label: "NFT", icon: Image },
    { href: "/id", label: "Identity", icon: AtSign },
    { href: "/multisig", label: "Multisig", icon: ShieldCheck },
    { href: "/scan", label: "Scan", icon: Activity },
    { href: "/receipt", label: "Receipt", icon: Receipt },
    { href: "/draw", label: "Draw", icon: Dices },
    { href: "/news", label: "News", icon: Newspaper },
    { href: "/whats-new", label: "What's new", icon: Sparkles },
  ];

  const isActive = (href: string) =>
    pathname === href ||
    (href.startsWith("/wallet") && pathname.startsWith("/wallet")) ||
    (href === "/lists" && pathname.startsWith("/lists"));

  return (
    <nav>
      <div className="sticky top-0 z-30 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-md safe-top">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 lg:px-6 py-2.5 sm:py-3 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/" onDoubleClick={() => router.push("/dir")} className="flex items-center gap-2 shrink-0 touch-target justify-center">
            <img src="/icon-192.png" alt="sol.new" className="w-8 h-8 sm:w-8 sm:h-8 rounded-lg" />
            <span className="text-lg sm:text-xl font-bold tracking-tight hidden md:inline">sol<span className="text-purple-400">.new</span></span>
          </Link>
          <button
            onClick={toggle}
            className="cursor-pointer shrink-0 touch-target inline-flex items-center justify-center"
            title={`Switch to ${network === "mainnet" ? "devnet" : "mainnet"}`}
          >
            <span
              className={`inline-flex items-center justify-center min-w-[2.75rem] text-[10px] font-medium border rounded-md px-1.5 py-1 transition-colors ${
                network === "devnet"
                  ? "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                  : "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20"
              }`}
            >
              {network === "devnet" ? "test" : "live"}
            </span>
          </button>
          {/* Tablet: icon strip (iPad portrait / small landscape) */}
          <div className="hidden md:flex lg:hidden items-center gap-0.5">
            {TABLET_NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`touch-target inline-flex flex-col items-center justify-center gap-0.5 px-2.5 rounded-xl text-[10px] transition ${
                    active
                      ? "bg-black/10 dark:bg-white/10 text-purple-500 dark:text-purple-300"
                      : "text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <item.icon size={18} />
                  <span className="leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
          {/* Desktop: full labeled nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const isWhatsNew = item.href === "/whats-new";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1.5 rounded-lg text-sm transition whitespace-nowrap ${
                    active
                      ? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white"
                      : isWhatsNew
                      ? "text-orange-500 dark:text-orange-400 hover:bg-orange-500/10 animate-[whatsnew-glow_3s_ease-in-out_infinite]"
                      : "text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <item.icon size={15} className="inline mr-1" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <a href="https://x.com/soldotnew" target="_blank" className="hidden xl:inline-flex text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition" title="X">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a href="https://t.me/soldotnew" target="_blank" className="hidden xl:inline-flex text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition" title="Telegram">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
          <ThemeToggle />
          {publicKey ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-1.5 sm:gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-2.5 sm:px-3 py-2 min-h-[40px] text-xs sm:text-sm hover:border-purple-400/30 transition cursor-pointer"
              >
                <Wallet size={14} className="text-purple-400 sm:hidden" />
                {balance !== null ? (
                  <span className="text-purple-400 font-mono">
                    {balance.toFixed(balance < 1 ? 3 : 2)}
                    <span className="hidden sm:inline"> SOL</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center text-purple-400">
                    <Spinner size={12} className="text-purple-400" />
                  </span>
                )}
                <span className="text-gray-600 dark:text-white/60 max-w-[90px] truncate">
                  {walletLabel || shortKey}
                </span>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl overflow-hidden min-w-[220px] max-w-[min(100vw-1.5rem,320px)] shadow-lg">
                    <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
                      {walletLabel && <p className="text-sm font-semibold text-gray-900 dark:text-white">{walletLabel}</p>}
                      <p className="text-xs font-mono text-gray-500 dark:text-white/40 break-all mt-0.5">{publicKey}</p>
                      {balance !== null ? (
                        <p className="text-sm font-mono text-purple-400 mt-2">{balance.toFixed(4)} SOL</p>
                      ) : (
                        <p className="text-sm font-mono text-purple-400 mt-2 flex items-center gap-1.5">
                          <Spinner size={12} className="text-purple-400" /> fetching…
                        </p>
                      )}
                    </div>
                    <Link
                      href="/wallet"
                      onClick={() => setShowMenu(false)}
                      className="block px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      <Wallet size={14} className="inline mr-1.5" /> Wallet details
                    </Link>
                    <a
                      href={`https://orbmarkets.io/address/${publicKey}${network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true"}`}
                      target="_blank"
                      className="block px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      <ExternalLink size={14} className="inline mr-1.5" /> View on Orb
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publicKey);
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                    >
                      <Copy size={14} className="inline mr-1.5" /> Copy address
                    </button>
                    {network === "devnet" && (
                      <button
                        onClick={() => { handleAirdrop(); setShowMenu(false); }}
                        disabled={airdropping}
                        className="block w-full text-left px-4 py-2.5 text-sm text-yellow-400 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer disabled:opacity-50"
                      >
                        {airdropping ? "Airdropping..." : airdropDone ? <><Zap size={14} className="inline mr-1" /> 0.1 SOL sent!</> : <><Droplets size={14} className="inline mr-1" /> Airdrop 0.1 SOL</>}
                      </button>
                    )}
                    {pushPermission !== "unsupported" && (
                      <button
                        onClick={async () => {
                          setPushLoading(true);
                          if (pushPermission === "granted") {
                            await unsubscribePush();
                            setPushPermission("default");
                          } else {
                            await subscribePush(publicKey ?? undefined);
                            setPushPermission(getPushPermission());
                          }
                          setPushLoading(false);
                        }}
                        disabled={pushLoading || pushPermission === "denied"}
                        className="block w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer disabled:opacity-40"
                        title={pushPermission === "denied" ? "Blocked in browser settings" : undefined}
                      >
                        {pushPermission === "granted"
                          ? <><BellOff size={14} className="inline mr-1.5" />Turn off notifications</>
                          : <><Bell size={14} className="inline mr-1.5" />{pushLoading ? "Enabling…" : "Enable notifications"}</>
                        }
                      </button>
                    )}
                    {wallets.length > 1 && (
                      <div className="border-t border-black/10 dark:border-white/10">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30 px-4 pt-2.5 pb-1">Switch wallet</p>
                        {wallets.map((w) => (
                          <button
                            key={w.pubkey}
                            onClick={() => { switchWallet(w.pubkey); setShowMenu(false); }}
                            className={`flex items-center justify-between w-full px-4 py-2 text-sm transition cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${w.pubkey === publicKey ? "text-purple-400" : "text-gray-600 dark:text-white/60"}`}
                          >
                            <span className="truncate max-w-[130px]">{w.label}</span>
                            <span className="text-[10px] font-mono text-gray-400 dark:text-white/30 ml-2 shrink-0">{w.pubkey.slice(0, 4)}…{w.pubkey.slice(-4)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        disconnect();
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer border-t border-black/10 dark:border-white/10"
                    >
                      <LogOut size={14} className="inline mr-1.5" /> Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => connect()}
                disabled={loading}
                className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium rounded-xl px-3.5 sm:px-4 py-2 min-h-[40px] transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "..." : "Connect"}
              </button>
              <button
                onClick={() => recover()}
                disabled={loading}
                className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-xl px-3 py-2 min-h-[40px] hover:text-gray-900 dark:hover:text-white transition cursor-pointer disabled:opacity-50 hidden sm:block"
              >
                Recover
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Phone bottom nav only (< sm). iPad uses tablet top strip. */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white/95 dark:bg-black/95 backdrop-blur border-t border-black/10 dark:border-white/10 flex items-stretch justify-around px-1 pt-1 safe-bottom">
        {MOBILE_PRIMARY.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[52px] transition active:scale-95 ${
              isActive(item.href)
                ? "text-purple-400"
                : "text-gray-500 dark:text-white/40 active:text-gray-700 dark:active:text-white/70"
            }`}
          >
            <item.icon size={22} strokeWidth={isActive(item.href) ? 2.25 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setShowMore(true)}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[52px] transition active:scale-95 ${
            MOBILE_MORE.some((i) => isActive(i.href)) ? "text-purple-400" : "text-gray-500 dark:text-white/40"
          }`}
        >
          <MoreHorizontal size={22} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>

      {/* More tray — phones */}
      {showMore && (
        <>
          <div className="fixed inset-0 z-[60] sm:hidden bg-black/40 backdrop-blur-sm" onClick={() => setShowMore(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[70] sm:hidden bg-white dark:bg-black border-t border-black/10 dark:border-white/10 rounded-t-2xl pb-safe animate-[slideUp_0.2s_ease-out] max-h-[85dvh] overflow-y-auto">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/15" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">More</span>
              <button onClick={() => setShowMore(false)} className="text-gray-400 dark:text-white/30 p-2 touch-target cursor-pointer" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-4 gap-1 px-3 pb-8">
              {MOBILE_MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3.5 min-h-[72px] rounded-xl transition active:scale-95 ${
                    isActive(item.href)
                      ? "text-purple-400 bg-purple-500/10"
                      : item.href === "/whats-new"
                      ? "text-orange-400 hover:bg-orange-500/10"
                      : "text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <item.icon size={24} />
                  <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Airdrop spinner (subtle corner indicator) */}
      {airdropping && (
        <div className="fixed bottom-6 right-6 z-[100] bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg animate-[fadeIn_0.2s_ease-out]">
          <Spinner size={20} className="text-yellow-400" />
          <span className="text-sm font-medium text-yellow-400">Airdropping...</span>
        </div>
      )}
    </nav>
  );
}
