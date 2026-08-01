"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useState, useEffect } from "react";
import {
  Coins,
  Image,
  ShieldCheck,
  Wallet,
  Droplets,
  Zap,
  ExternalLink,
  Copy,
  LogOut,
  Sparkles,
  Bell,
  BellOff,
  Activity,
  AtSign,
  MoreHorizontal,
  X,
  Gift,
  Trophy,
  HandCoins,
  Newspaper,
  Star,
  Receipt,
  Dices,
  Link2,
  TrendingUp,
  Landmark,
  Layers,
  FolderOpen,
  Flame,
  Users,
  ArrowLeftRight,
} from "lucide-react";
import { getPushPermission, subscribePush, unsubscribePush, type PushPermission } from "@/lib/push-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Spinner } from "@/components/spinner";
import { PageBack } from "@/components/page-back";
import { useDefaultToken } from "@/lib/currency-pref";
import type { LucideIcon } from "lucide-react";

/** Desktop top nav — short, high-traffic only. */
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/punt", label: "Punt", icon: Trophy },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

/** Tablet icon strip. */
const TABLET_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/punt", label: "Punt", icon: Trophy },
  { href: "/portfolio", label: "Port", icon: FolderOpen },
];

type MoreItem = { href: string; label: string; icon: LucideIcon };

const MORE_GROUPS: { title: string; items: MoreItem[] }[] = [
  {
    title: "Create",
    items: [
      { href: "/token", label: "Token", icon: Coins },
      { href: "/nft", label: "Mint NFT", icon: Image },
      { href: "/multisig", label: "Multisig", icon: ShieldCheck },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/get", label: "Get funds", icon: HandCoins },
      { href: "/pay", label: "Pay", icon: HandCoins },
      { href: "/split", label: "Split", icon: Users },
      { href: "/gift", label: "Gift", icon: Gift },
      { href: "/earn", label: "Earn", icon: TrendingUp },
      { href: "/loan", label: "Loan", icon: Landmark },
      { href: "/swap", label: "Swap", icon: ArrowLeftRight },
      { href: "/stake", label: "Stake", icon: Landmark },
      { href: "/lst", label: "Liquid", icon: Droplets },
    ],
  },
  {
    title: "Explore",
    items: [
      { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
      { href: "/nfts", label: "NFTs", icon: Layers },
      { href: "/lists", label: "Lists", icon: Star },
      { href: "/scan", label: "Scan", icon: Activity },
      { href: "/receipt", label: "Receipt", icon: Receipt },
      { href: "/draw", label: "Draw", icon: Dices },
      { href: "/punt", label: "Punt", icon: Trophy },
      { href: "/burn", label: "Burn", icon: Flame },
      { href: "/id", label: "Names", icon: AtSign },
      { href: "/link", label: "Links", icon: Link2 },
      { href: "/news", label: "News", icon: Newspaper },
      { href: "/whats-new", label: "What's new", icon: Sparkles },
    ],
  },
];

const MOBILE_PRIMARY = [
  { href: "/", label: "Home", icon: Zap },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
];

export function Navbar() {
  const {
    publicKey,
    walletLabel,
    wallets,
    balance,
    connect,
    recover,
    switchWallet,
    disconnect,
    loading,
    airdropping,
    airdropDone,
    handleAirdrop,
  } = useWallet();
  const { network, toggle } = useNetwork();
  const [defaultToken, setDefaultToken] = useDefaultToken();
  const [showMenu, setShowMenu] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setPushPermission(getPushPermission());
  }, [showMenu]);

  // Close trays on route change
  useEffect(() => {
    setShowMore(false);
    setShowMenu(false);
  }, [pathname]);

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return (
      pathname === href ||
      pathname.startsWith(href + "/") ||
      (href === "/wallet" && pathname.startsWith("/wallet"))
    );
  };

  const moreActive = MORE_GROUPS.some((g) => g.items.some((i) => isActive(i.href)));

  return (
    <nav>
      <div className="sticky top-0 z-30 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-md safe-top">
        <div className="flex items-center justify-between gap-2 px-2 sm:px-5 lg:px-6 py-2 sm:py-3 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <PageBack className="shrink-0 -ml-0.5" />

            <Link
              href="/"
              onDoubleClick={() => router.push("/dir")}
              className="flex items-center gap-2 shrink-0 min-h-[40px] px-1 justify-center"
            >
              <img src="/icon-192.png" alt="sol.new" className="w-8 h-8 rounded-lg" />
              <span className="text-lg sm:text-xl font-bold tracking-tight hidden md:inline">
                sol<span className="text-purple-500 dark:text-purple-400">.new</span>
              </span>
            </Link>

            <button
              type="button"
              onClick={toggle}
              className="cursor-pointer shrink-0 min-h-[36px] inline-flex items-center justify-center"
              title={`Switch to ${network === "mainnet" ? "devnet" : "mainnet"}`}
            >
              <span
                className={`inline-flex items-center justify-center min-w-[2.5rem] text-[10px] font-medium border rounded-md px-1.5 py-1 transition-colors ${
                  network === "devnet"
                    ? "text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                    : "text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20"
                }`}
              >
                {network === "devnet" ? "test" : "live"}
              </span>
            </button>

            <div className="hidden md:flex lg:hidden items-center gap-0.5 ml-1">
              {TABLET_NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`min-h-[44px] min-w-[48px] inline-flex flex-col items-center justify-center gap-0.5 px-2 rounded-xl text-[10px] transition ${
                      active
                        ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                        : "text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="leading-none">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center gap-0.5 ml-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1.5 rounded-lg text-sm transition whitespace-nowrap ${
                      active
                        ? "bg-purple-500/15 text-purple-800 dark:text-purple-200"
                        : "text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <item.icon size={15} className="inline mr-1" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className={`px-2.5 py-1.5 rounded-lg text-sm transition cursor-pointer ${
                  moreActive
                    ? "bg-purple-500/15 text-purple-800 dark:text-purple-200"
                    : "text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <MoreHorizontal size={15} className="inline mr-1" />
                More
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggle />
            {publicKey ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-1.5 sm:gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-2.5 sm:px-3 py-2 min-h-[40px] text-xs sm:text-sm hover:border-purple-400/30 transition cursor-pointer"
                >
                  <Wallet size={14} className="text-purple-500 dark:text-purple-400 sm:hidden" />
                  {balance !== null ? (
                    <span className="text-purple-600 dark:text-purple-400 font-mono">
                      {balance.toFixed(balance < 1 ? 3 : 2)}
                      <span className="hidden sm:inline"> SOL</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-purple-500">
                      <Spinner size={12} className="text-purple-500" />
                    </span>
                  )}
                  <span className="text-gray-700 dark:text-white/60 max-w-[90px] truncate">
                    {walletLabel || shortKey}
                  </span>
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl overflow-hidden min-w-[220px] max-w-[min(100vw-1.5rem,320px)] shadow-lg">
                      <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
                        {walletLabel && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {walletLabel}
                          </p>
                        )}
                        <p className="text-xs font-mono text-gray-500 dark:text-white/40 break-all mt-0.5">
                          {publicKey}
                        </p>
                        {balance !== null ? (
                          <p className="text-sm font-mono text-purple-600 dark:text-purple-400 mt-2">
                            {balance.toFixed(4)} SOL
                          </p>
                        ) : (
                          <p className="text-sm font-mono text-purple-500 mt-2 flex items-center gap-1.5">
                            <Spinner size={12} /> fetching…
                          </p>
                        )}
                      </div>
                      <Link
                        href="/wallet"
                        onClick={() => setShowMenu(false)}
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Wallet size={14} className="inline mr-1.5" /> Wallet
                      </Link>
                      <Link
                        href="/portfolio"
                        onClick={() => setShowMenu(false)}
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <FolderOpen size={14} className="inline mr-1.5" /> Portfolio
                      </Link>
                      <div className="px-4 py-2.5 border-b border-black/10 dark:border-white/10">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
                          Default currency
                        </p>
                        <div className="flex gap-1.5">
                          {(["SOL", "USDC"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setDefaultToken(t)}
                              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition cursor-pointer border ${
                                defaultToken === t
                                  ? "bg-purple-500/15 border-purple-400/50 text-purple-700 dark:text-purple-300"
                                  : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <a
                        href={`https://orbmarkets.io/address/${publicKey}${network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true"}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <ExternalLink size={14} className="inline mr-1.5" /> View on Orb
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(publicKey);
                          setShowMenu(false);
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <Copy size={14} className="inline mr-1.5" /> Copy address
                      </button>
                      {network === "devnet" && (
                        <button
                          type="button"
                          onClick={() => {
                            handleAirdrop();
                            setShowMenu(false);
                          }}
                          disabled={airdropping}
                          className="block w-full text-left px-4 py-2.5 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                        >
                          {airdropping ? (
                            "Airdropping..."
                          ) : airdropDone ? (
                            <>
                              <Zap size={14} className="inline mr-1" /> 0.1 SOL sent!
                            </>
                          ) : (
                            <>
                              <Droplets size={14} className="inline mr-1" /> Airdrop 0.1 SOL
                            </>
                          )}
                        </button>
                      )}
                      {pushPermission !== "unsupported" && (
                        <button
                          type="button"
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
                          className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-40"
                        >
                          {pushPermission === "granted" ? (
                            <>
                              <BellOff size={14} className="inline mr-1.5" /> Turn off notifications
                            </>
                          ) : (
                            <>
                              <Bell size={14} className="inline mr-1.5" />
                              {pushLoading ? "Enabling…" : "Enable notifications"}
                            </>
                          )}
                        </button>
                      )}
                      {wallets.length > 0 && (
                        <div className="border-t border-black/10 dark:border-white/10">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 px-4 pt-2.5 pb-1">
                            Switch wallet
                          </p>
                          {wallets.slice(0, 12).map((w) => (
                            <button
                              key={w.pubkey}
                              type="button"
                              onClick={() => {
                                switchWallet(w.pubkey);
                                setShowMenu(false);
                              }}
                              className={`flex items-center justify-between w-full px-4 py-2 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${
                                w.pubkey === publicKey
                                  ? "text-purple-600 dark:text-purple-400"
                                  : "text-gray-600 dark:text-white/60"
                              }`}
                            >
                              <span className="truncate max-w-[130px]">{w.label}</span>
                              <span className="text-[10px] font-mono text-gray-400 ml-2 shrink-0">
                                {w.pubkey.slice(0, 4)}…{w.pubkey.slice(-4)}
                              </span>
                            </button>
                          ))}
                          <Link
                            href="/wallet/find"
                            onClick={() => setShowMenu(false)}
                            className="block w-full text-left px-4 py-2.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            Find correct wallet…
                          </Link>
                        </div>
                      )}
                      {wallets.length === 0 && (
                        <Link
                          href="/wallet/find"
                          onClick={() => setShowMenu(false)}
                          className="block w-full text-left px-4 py-2.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-black/5 dark:hover:bg-white/5 border-t border-black/10 dark:border-white/10"
                        >
                          Find correct wallet…
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          disconnect();
                          setShowMenu(false);
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer border-t border-black/10 dark:border-white/10"
                      >
                        <LogOut size={14} className="inline mr-1.5" /> Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => connect()}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl px-3.5 py-2 min-h-[40px] transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? "..." : "Connect"}
                </button>
                <button
                  type="button"
                  onClick={() => recover({ forcePicker: true })}
                  disabled={loading}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-xl px-3 py-2 min-h-[40px] transition cursor-pointer disabled:opacity-50 hidden sm:block"
                >
                  Recover
                </button>
                <Link
                  href="/wallet/find"
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-xl px-3 py-2 min-h-[40px] transition hidden sm:flex items-center"
                >
                  Find
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phone bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white/95 dark:bg-black/95 backdrop-blur border-t border-black/10 dark:border-white/10 flex items-stretch justify-around px-1 pt-1 safe-bottom">
        {MOBILE_PRIMARY.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[52px] transition active:scale-95 touch-manipulation ${
              isActive(item.href)
                ? "text-purple-600 dark:text-purple-400"
                : "text-gray-500 dark:text-white/40"
            }`}
          >
            <item.icon size={22} strokeWidth={isActive(item.href) ? 2.25 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[52px] transition active:scale-95 touch-manipulation cursor-pointer ${
            moreActive ? "text-purple-600 dark:text-purple-400" : "text-gray-500 dark:text-white/40"
          }`}
        >
          <MoreHorizontal size={22} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>

      {/* More tray — phones + desktop "More" */}
      {showMore && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMore(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-black border-t border-black/10 dark:border-white/10 rounded-t-2xl pb-safe animate-[slideUp_0.2s_ease-out] max-h-[85dvh] overflow-y-auto sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-20 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl sm:border sm:shadow-xl">
            <div className="flex justify-center pt-2 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/15" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-2 sticky top-0 bg-white dark:bg-black z-10">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Menu</span>
              <button
                type="button"
                onClick={() => setShowMore(false)}
                className="text-gray-400 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-3 pb-10 space-y-4">
              {MORE_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30 px-2 mb-1.5">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setShowMore(false)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-3 min-h-[72px] rounded-xl transition active:scale-95 touch-manipulation ${
                          isActive(item.href)
                            ? "text-purple-700 dark:text-purple-300 bg-purple-500/15"
                            : "text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        <item.icon size={22} />
                        <span className="text-[11px] font-medium text-center leading-tight">
                          {item.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {airdropping && (
        <div className="fixed bottom-20 sm:bottom-6 right-6 z-[100] bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
          <Spinner size={20} className="text-yellow-500" />
          <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
            Airdropping...
          </span>
        </div>
      )}
    </nav>
  );
}
