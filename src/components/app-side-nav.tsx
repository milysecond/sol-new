"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Home,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  NAV_ITEMS,
  filterNav,
  groupNavByCategory,
  sortNavAlpha,
  type NavItem,
} from "@/lib/nav-catalog";
import { useWallet } from "@/lib/wallet-context";
import { formatSol, useHideBalances } from "@/lib/privacy";
import { SocialLinks } from "@/components/social-links";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * X / LinkedIn style left underlying drawer menu.
 * Opens from left over a dim scrim; full app catalog as list rows.
 */
export function AppSideNav({
  open,
  onClose,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  isActive: (href: string) => boolean;
}) {
  const { publicKey, balance } = useWallet();
  const [hideBalances] = useHideBalances();
  const [q, setQ] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setQ("");
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const catalog = useMemo(
    () => NAV_ITEMS.filter((i) => i.href !== "/home"),
    [],
  );
  const filtered = useMemo(() => filterNav(catalog, q), [catalog, q]);
  const searching = q.trim().length > 0;

  if (!open || !portalReady) return null;

  const bal =
    balance == null ? null : formatSol(hideBalances, balance, 3);
  const shortPk = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  let body: React.ReactNode;
  if (searching) {
    const list = sortNavAlpha(filtered);
    body = (
      <div className="px-2 pb-4">
        <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">
          {list.length} result{list.length === 1 ? "" : "s"}
        </p>
        {list.length === 0 ? (
          <p className="px-3 py-8 text-sm text-gray-500 text-center">No matches</p>
        ) : (
          list.map((item) => (
            <SideRow
              key={item.href}
              item={item}
              active={isActive(item.href)}
              onNavigate={onClose}
            />
          ))
        )}
      </div>
    );
  } else {
    const groups = groupNavByCategory(catalog);
    body = (
      <div className="px-2 pb-8 space-y-1">
        <SideRow
          item={{
            href: "/home",
            label: "Home",
            title: "Home",
            desc: "App grid",
            icon: Home,
            color: "text-purple-500",
            category: "info",
          }}
          active={isActive("/home")}
          onNavigate={onClose}
        />
        {groups.map((g) => (
          <div key={g.id} className="pt-3">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
              {g.title}
            </p>
            {g.items.map((item) => (
              <SideRow
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={onClose}
              />
            ))}
          </div>
        ))}
        <div className="pt-3">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
            Account
          </p>
          <SideRow
            item={{
              href: "/wallet/settings",
              label: "Settings",
              title: "Settings",
              desc: "Privacy, lock, menu style",
              icon: Settings,
              color: "text-gray-500",
              category: "wallet",
            }}
            active={isActive("/wallet/settings")}
            onNavigate={onClose}
          />
        </div>
      </div>
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-[200] bg-black/50 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="App menu"
        className={`fixed top-0 left-0 bottom-0 z-[210] w-[min(86vw,320px)] max-w-full bg-white dark:bg-black border-r border-black/10 dark:border-white/10 shadow-2xl flex flex-col transition-transform duration-200 ease-out safe-top ${
          entered ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ transform: entered ? "translateX(0)" : "translateX(-100%)" }}
      >
        {/* Profile strip — LinkedIn/X vibe */}
        <div className="shrink-0 border-b border-black/10 dark:border-white/10 px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={publicKey ? "/wallet/get" : "/onboard"}
              onClick={onClose}
              className="min-w-0 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {publicKey ? publicKey.slice(0, 2).toUpperCase() : "S"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {shortPk || "Connect wallet"}
                </p>
                <p className="text-xs text-gray-500 dark:text-white/45 font-mono">
                  {bal != null ? bal : publicKey ? "…" : "sol.new"}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <SocialLinks />
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-3 py-2 border-b border-black/5 dark:border-white/5">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search apps…"
              autoComplete="off"
              className="w-full rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-400/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{body}</div>

        <div className="shrink-0 border-t border-black/10 dark:border-white/10 px-4 py-3 safe-bottom">
          <p className="text-[11px] text-gray-400 dark:text-white/35 leading-relaxed">
            Left menu · switch back to More tray in{" "}
            <Link
              href="/wallet/settings"
              onClick={onClose}
              className="text-violet-500 font-medium"
            >
              Settings
            </Link>
          </p>
        </div>
      </aside>
    </>,
    document.body,
  );
}

function SideRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 mx-1 px-3 py-2.5 min-h-[48px] rounded-xl transition touch-manipulation active:scale-[0.99] ${
        active
          ? "bg-violet-500/15 text-violet-800 dark:text-violet-200"
          : "text-gray-800 dark:text-white/85 hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <Icon
        size={20}
        className={active ? "text-violet-600 dark:text-violet-300" : item.color}
        strokeWidth={active ? 2.25 : 2}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight truncate">{item.label}</p>
        {item.desc && (
          <p className="text-[11px] text-gray-500 dark:text-white/40 truncate leading-snug">
            {item.desc}
          </p>
        )}
      </div>
    </Link>
  );
}
