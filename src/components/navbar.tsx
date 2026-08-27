"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Coins,
  Wallet,
  Droplets,
  Zap,
  ExternalLink,
  Copy,
  LogOut,
  Bell,
  BellOff,
  MoreHorizontal,
  Gift,
  Trophy,
  FolderOpen,
  Image,
  Menu,
} from "lucide-react";
import { AppNavMenu } from "@/components/app-nav-menu";
import { AppSideNav } from "@/components/app-side-nav";
import {
  readNavMenuStyle,
  NAV_MENU_STYLE_EVENT,
  type NavMenuStyle,
} from "@/lib/nav-style";
import {
  readBottomNavHrefs,
  resolveBottomNav,
  BOTTOM_NAV_EVENT,
} from "@/lib/bottom-nav";
import { getPushPermission, subscribePush, unsubscribePush, type PushPermission } from "@/lib/push-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SocialLinks } from "@/components/social-links";
import { Spinner } from "@/components/spinner";
import { PageBack } from "@/components/page-back";
import { WalletInfoModal } from "@/components/wallet-info-modal";
import { CommandPaletteButton, AppCommandPalette } from "@/components/app-command-palette";
import { useDefaultToken } from "@/lib/currency-pref";
import { formatSol, useHideBalances } from "@/lib/privacy";
import type { LucideIcon } from "lucide-react";

/** Desktop top nav — short, high-traffic only. */
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/memes", label: "Memes", icon: Image },
  { href: "/punt", label: "Punt", icon: Trophy },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

/** Tablet icon strip. */
const TABLET_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/memes", label: "Memes", icon: Image },
  { href: "/punt", label: "Punt", icon: Trophy },
  { href: "/portfolio", label: "Port", icon: FolderOpen },
];

const MOBILE_PRIMARY = [
  { href: "/home", label: "Home", icon: Zap },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/token", label: "Token", icon: Coins },
  { href: "/gift", label: "Gift", icon: Gift },
  { href: "/memes", label: "Memes", icon: Image },
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
    refreshBalance,
  } = useWallet();
  const [hideBalances] = useHideBalances();
  const { network, toggle } = useNetwork();
  const [defaultToken, setDefaultToken] = useDefaultToken();
  const [showMenu, setShowMenu] = useState(false);
  const [walletSheet, setWalletSheet] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [menuStyle, setMenuStyle] = useState<NavMenuStyle>("sidebar");
  const [bottomHrefs, setBottomHrefs] = useState<string[]>([
    "/home",
    "/wallet",
    "/token",
    "/gift",
    "/memes",
  ]);
  const [navHeaderH, setNavHeaderH] = useState(56);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    setMenuStyle(readNavMenuStyle());
    setBottomHrefs(readBottomNavHrefs());
    const onStyle = () => setMenuStyle(readNavMenuStyle());
    const onBottom = () => setBottomHrefs(readBottomNavHrefs());
    window.addEventListener(NAV_MENU_STYLE_EVENT, onStyle);
    window.addEventListener(BOTTOM_NAV_EVENT, onBottom);
    window.addEventListener("storage", onStyle);
    window.addEventListener("storage", onBottom);
    return () => {
      window.removeEventListener(NAV_MENU_STYLE_EVENT, onStyle);
      window.removeEventListener(BOTTOM_NAV_EVENT, onBottom);
      window.removeEventListener("storage", onStyle);
      window.removeEventListener("storage", onBottom);
    };
  }, []);

  // Measure sticky header so side drawer sits below it
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setNavHeaderH(Math.round(r.bottom));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    setPushPermission(getPushPermission());
  }, [showMenu]);

  // Close trays on route change
  useEffect(() => {
    setShowMore(false);
    setShowMenu(false);
  }, [pathname]);

  // Position menu in viewport coords (escape transform stacking contexts)
  useEffect(() => {
    if (!showMenu) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = menuBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - r.right);
      const top = r.bottom + 8;
      setMenuPos({ top, right });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showMenu]);

  // Lock body scroll lightly while menu open
  useEffect(() => {
    if (!showMenu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showMenu]);

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;
  const displayName =
    walletLabel && publicKey && walletLabel !== publicKey
      ? walletLabel
      : shortKey;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return (
      pathname === href ||
      pathname.startsWith(href + "/") ||
      (href === "/wallet" && pathname.startsWith("/wallet"))
    );
  };

  const primaryHrefs = [
    ...bottomHrefs,
    "/punt",
    "/portfolio",
  ];
  const moreActive = Boolean(
    pathname &&
      pathname !== "/" &&
      !primaryHrefs.some(
        (h) => pathname === h || (h !== "/home" && pathname.startsWith(h + "/")),
      ),
  );

  return (
    <>
    <nav className="relative z-[80]">
      <div ref={headerRef} className="sticky top-0 z-[80] border-b border-black/10 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-md safe-top">
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 px-2.5 sm:px-5 lg:px-6 py-2 sm:py-2.5 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Logo — standard left position, always links home */}
            <Link
              href="/home"
              onDoubleClick={() => router.push("/dir")}
              className="flex items-center gap-2 shrink-0 h-8 pl-0.5 pr-1 justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
              aria-label="sol.new home"
            >
              <img src="/icon-192.png" alt="sol.new" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg" />
              <span className="text-lg sm:text-xl font-bold tracking-tight hidden md:inline">
                sol<span className="text-purple-500 dark:text-purple-400">.new</span>
              </span>
            </Link>

            {/* Back sits after logo — nested routes only */}
            <PageBack />

            <button
              type="button"
              onClick={toggle}
              className="cursor-pointer shrink-0 h-8 inline-flex items-center justify-center"
              title={`Switch to ${network === "mainnet" ? "devnet" : "mainnet"}`}
            >
              <span
                className={`inline-flex items-center justify-center h-7 min-w-[2.25rem] text-[10px] font-semibold border rounded-md px-2 leading-none transition-colors ${
                  network === "devnet"
                    ? "text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                    : "text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/20"
                }`}
              >
                {network === "devnet" ? "test" : "live"}
              </span>
            </button>

            <div className="hidden md:flex lg:hidden items-center gap-0.5 ml-0.5">
              {TABLET_NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`h-8 min-w-[40px] inline-flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg text-[10px] transition ${
                      active
                        ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                        : "text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <item.icon size={16} />
                    <span className="leading-none">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center gap-0.5 ml-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`h-8 px-2.5 inline-flex items-center rounded-lg text-sm transition whitespace-nowrap ${
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
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <SocialLinks className="hidden sm:flex" />
            <CommandPaletteButton onClick={() => setCmdOpen(true)} />
            <ThemeToggle />

            {/* Menu button on the right (standard) */}
            {pushPermission !== "unsupported" && (
              <button
                type="button"
                onClick={async () => {
                  setPushLoading(true);
                  try {
                    if (pushPermission === "granted") {
                      await unsubscribePush();
                      setPushPermission("default");
                    } else if (pushPermission !== "denied") {
                      await subscribePush(publicKey ?? undefined);
                      setPushPermission(getPushPermission());
                    }
                  } finally {
                    setPushLoading(false);
                  }
                }}
                disabled={pushLoading || pushPermission === "denied"}
                aria-label={
                  pushPermission === "granted"
                    ? "Notifications on — click to turn off"
                    : pushPermission === "denied"
                      ? "Notifications blocked in browser"
                      : "Enable notifications"
                }
                title={
                  pushPermission === "denied"
                    ? "Blocked in browser settings"
                    : pushPermission === "granted"
                      ? "Notifications on"
                      : "Enable notifications"
                }
                className={`inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg text-sm transition border ${
                  pushPermission === "granted"
                    ? "text-purple-600 dark:text-purple-400 border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/15"
                    : pushPermission === "denied"
                      ? "text-gray-400 border-black/10 dark:border-white/10 opacity-50 cursor-not-allowed"
                      : "text-gray-700 dark:text-white/70 border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {pushLoading ? (
                  <Spinner size={14} className="shrink-0 text-current" />
                ) : (
                  <Bell size={15} className="shrink-0" />
                )}
                <span className="hidden md:inline font-medium text-xs">
                  {pushLoading
                    ? pushPermission === "granted"
                      ? "Turning off"
                      : "Enabling"
                    : pushPermission === "granted"
                      ? "Alerts on"
                      : pushPermission === "denied"
                        ? "Blocked"
                        : "Notify"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-label="Open menu"
              className="inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg text-sm text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 transition border border-black/10 dark:border-white/10"
            >
              <Menu size={15} />
              <span className="hidden lg:inline font-medium text-xs">Menu</span>
            </button>
            {publicKey ? (
              <div className="relative">
                <button
                  ref={menuBtnRef}
                  type="button"
                  onClick={() => {
                    setWalletSheet(true);
                    setShowMenu(false);
                  }}
                  aria-expanded={walletSheet}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg h-8 px-2 sm:px-2.5 text-xs sm:text-sm hover:border-purple-400/30 transition cursor-pointer touch-manipulation active:scale-[0.98]"
                >
                  <Wallet size={14} className="text-purple-500 dark:text-purple-400 sm:hidden shrink-0" />
                  {balance !== null ? (
                    <span className="text-purple-600 dark:text-purple-400 font-mono tabular-nums">
                      {hideBalances ? (
                        "••••"
                      ) : (
                        <>
                          {balance.toFixed(balance < 1 ? 3 : 2)}
                          <span className="hidden sm:inline"> SOL</span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-purple-500">
                      <Spinner size={12} className="text-purple-500" />
                    </span>
                  )}
                  <span
                    className={`text-gray-700 dark:text-white/60 max-w-[72px] sm:max-w-[90px] truncate ${
                      walletLabel && publicKey && walletLabel !== publicKey ? "" : "font-mono"
                    }`}
                  >
                    {displayName}
                  </span>
                </button>

                {showMenu &&
                  portalReady &&
                  menuPos &&
                  createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[200] bg-black/40"
                        onClick={() => setShowMenu(false)}
                        aria-hidden
                      />
                      <div
                        role="menu"
                        className="fixed z-[210] bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl overflow-y-auto max-h-[min(70vh,520px)] min-w-[240px] w-[min(100vw-1rem,320px)] shadow-2xl"
                        style={{ top: menuPos.top, right: menuPos.right }}
                      >
                      <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
                        {publicKey && (
                          <p
                            className="text-sm font-mono font-semibold text-gray-900 dark:text-white break-all"
                            title={publicKey}
                          >
                            {publicKey}
                          </p>
                        )}
                        {walletLabel && walletLabel !== publicKey && (
                          <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 mt-1 truncate">
                            {walletLabel}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">
                          Label wallets in Settings · address stays the same
                        </p>
                        {balance !== null ? (
                          <p className="text-sm font-mono text-purple-600 dark:text-purple-400 mt-2">
                            {formatSol(hideBalances, balance, 4)}
                          </p>
                        ) : (
                          <p className="text-sm font-mono text-purple-500 mt-2 flex items-center gap-1.5">
                            <Spinner size={12} /> fetching…
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Tab title uses your address
                        </p>
                      </div>
                      <Link
                        href="/wallet"
                        onClick={() => setShowMenu(false)}
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Wallet size={14} className="inline mr-1.5" /> Wallet
                      </Link>
                      <Link
                        href="/wallet/settings"
                        onClick={() => setShowMenu(false)}
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        Label wallets…
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
                      <Link
                        href={`/address/${publicKey}`}
                        onClick={() => setShowMenu(false)}
                        className="block px-4 py-2.5 text-sm text-gray-700 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <ExternalLink size={14} className="inline mr-1.5" /> View address
                      </Link>
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
                          {pushLoading ? (
                            <>
                              <Spinner size={14} className="inline mr-1.5" />
                              {pushPermission === "granted" ? "Turning off…" : "Enabling…"}
                            </>
                          ) : pushPermission === "granted" ? (
                            <>
                              <BellOff size={14} className="inline mr-1.5" /> Turn off notifications
                            </>
                          ) : (
                            <>
                              <Bell size={14} className="inline mr-1.5" />
                              Enable notifications
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
                                void switchWallet(w.pubkey);
                                setShowMenu(false);
                              }}
                              className={`flex items-center justify-between w-full px-4 py-2 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${
                                w.pubkey === publicKey
                                  ? "text-purple-600 dark:text-purple-400"
                                  : "text-gray-600 dark:text-white/60"
                              }`}
                            >
                              <span className="truncate max-w-[130px]">
                                {w.label && w.label !== w.pubkey
                                  ? w.label
                                  : `${w.pubkey.slice(0, 4)}…${w.pubkey.slice(-4)}`}
                              </span>
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
                    </>,
                    document.body,
                  )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg px-3 py-1.5 min-h-[32px] transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner size={12} className="text-white" />
                      Connecting
                    </span>
                  ) : (
                    "Connect"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void connect({ createNew: true })}
                  disabled={loading}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-lg px-2.5 py-1.5 min-h-[32px] transition cursor-pointer disabled:opacity-50 hidden sm:block"
                  title="Only if you need a brand-new wallet"
                >
                  New
                </button>
                <Link
                  href="/wallet/find"
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-lg px-2.5 py-1.5 min-h-[32px] transition hidden sm:flex items-center"
                >
                  Find
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phone bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-[90] sm:hidden bg-white/95 dark:bg-black/95 backdrop-blur border-t border-black/10 dark:border-white/10 flex items-stretch justify-around px-1 pt-1 safe-bottom">
        {resolveBottomNav(bottomHrefs).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[44px] transition active:scale-95 touch-manipulation ${
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
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl flex-1 max-w-[72px] min-h-[44px] transition active:scale-95 touch-manipulation cursor-pointer ${
            moreActive ? "text-purple-600 dark:text-purple-400" : "text-gray-500 dark:text-white/40"
          }`}
        >
          {menuStyle === "sidebar" ? <Menu size={22} /> : <MoreHorizontal size={22} />}
          <span className="text-[10px] font-medium">
            {menuStyle === "sidebar" ? "Menu" : "More"}
          </span>
        </button>
      </div>

      {menuStyle === "sidebar" ? (
        <AppSideNav
          open={showMore}
          onClose={() => setShowMore(false)}
          isActive={isActive}
          topOffset={navHeaderH}
        />
      ) : (
        <AppNavMenu
          open={showMore}
          onClose={() => setShowMore(false)}
          isActive={isActive}
        />
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

      {publicKey && (
        <WalletInfoModal
          open={walletSheet}
          onClose={() => setWalletSheet(false)}
          address={publicKey}
          label={walletLabel || undefined}
          balanceSol={hideBalances ? null : balance}
          balanceLoading={!hideBalances && balance === null}
          balanceDisplay={
            hideBalances ? (
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">••••</p>
            ) : undefined
          }
          networkLabel={network === "devnet" ? "devnet" : "mainnet"}
          isDevnet={network === "devnet"}
          copied={copiedAddr}
          defaultToken={defaultToken}
          onDefaultToken={setDefaultToken}
          wallets={wallets}
          onSwitchWallet={(pk) => {
            void switchWallet(pk);
            setWalletSheet(false);
          }}
          pushPermission={pushPermission}
          pushLoading={pushLoading}
          onTogglePush={async () => {
            setPushLoading(true);
            try {
              if (pushPermission === "granted") {
                await unsubscribePush();
                setPushPermission("default");
              } else {
                await subscribePush(publicKey ?? undefined);
                setPushPermission(getPushPermission());
              }
            } finally {
              setPushLoading(false);
            }
          }}
          airdropping={airdropping}
          airdropDone={airdropDone}
          onAirdrop={() => {
            handleAirdrop();
          }}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(publicKey);
              setCopiedAddr(true);
              setTimeout(() => setCopiedAddr(false), 1500);
            } catch {
              /* ignore */
            }
          }}
          onSend={() => {
            setWalletSheet(false);
            router.push("/wallet/send");
          }}
          onReceive={() => {
            setWalletSheet(false);
            router.push(`/address/${publicKey}`);
          }}
          onViewAddress={() => {
            setWalletSheet(false);
            router.push(`/address/${publicKey}`);
          }}
          onPrivate={() => {
            setWalletSheet(false);
            router.push("/private");
          }}
          onWallet={() => {
            setWalletSheet(false);
            router.push("/wallet");
          }}
          onPortfolio={() => {
            setWalletSheet(false);
            router.push("/portfolio");
          }}
          onSettings={() => {
            setWalletSheet(false);
            router.push("/wallet/settings");
          }}
          onLabelWallets={() => {
            setWalletSheet(false);
            router.push("/wallet/settings");
          }}
          onFindWallet={() => {
            setWalletSheet(false);
            router.push("/wallet/find");
          }}
          onRefresh={() => {
            void refreshBalance();
          }}
          onDisconnect={() => {
            disconnect();
            setWalletSheet(false);
          }}
        />
      )}
      <AppCommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}
