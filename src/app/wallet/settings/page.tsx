"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Fingerprint,
  Eye,
  EyeOff,
  Lock,
  Wallet,
  Users,
  Trash2,
  ExternalLink,
  Check,
  AlertTriangle,
  Info,
  PanelLeft,
  LayoutGrid,
} from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { useWallet } from "@/lib/wallet-context";
import { toast } from "@/lib/toast";
import { useHideBalances } from "@/lib/privacy";
import {
  readNavMenuStyle,
  writeNavMenuStyle,
  type NavMenuStyle,
} from "@/lib/nav-style";
import {
  BOTTOM_NAV_DEFAULT,
  bottomNavCandidates,
  clearBottomNavHrefs,
  readBottomNavHrefs,
  writeBottomNavHrefs,
} from "@/lib/bottom-nav";

const AUTO_LOCK_KEY = "sol.new.security.autoLockMin";

function readAutoLock(): number {
  try {
    const n = Number(localStorage.getItem(AUTO_LOCK_KEY) || "15");
    return [0, 5, 15, 30, 60].includes(n) ? n : 15;
  } catch {
    return 15;
  }
}

export default function WalletSettingsPage() {
  const {
    publicKey,
    wallets,
    disconnect,
    removeWallet,
    switchWallet,
    loading,
  } = useWallet();
  const [hideBalances, setHideBalances] = useHideBalances();
  const [autoLockMin, setAutoLockMin] = useState(15);
  const [menuStyle, setMenuStyle] = useState<NavMenuStyle>("more");
  const [bottomTabs, setBottomTabs] = useState<string[]>([...BOTTOM_NAV_DEFAULT]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setAutoLockMin(readAutoLock());
    setMenuStyle(readNavMenuStyle());
    setBottomTabs(readBottomNavHrefs());
    setMounted(true);
  }, []);

  // Auto-lock: clear active session after idle
  useEffect(() => {
    if (!mounted || autoLockMin <= 0 || !publicKey) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        disconnect();
        toast.info("Wallet locked after inactivity — unlock with passkey");
      }, autoLockMin * 60_000);
    };
    const evts = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const e of evts) window.addEventListener(e, bump, { passive: true });
    bump();
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of evts) window.removeEventListener(e, bump);
    };
  }, [mounted, autoLockMin, publicKey, disconnect]);

  const toggleHide = useCallback(() => {
    setHideBalances(!hideBalances);
  }, [hideBalances, setHideBalances]);

  const setLock = (mins: number) => {
    setAutoLockMin(mins);
    try {
      localStorage.setItem(AUTO_LOCK_KEY, String(mins));
    } catch {
      /* ignore */
    }
  };

  const lockNow = () => {
    disconnect();
    toast.success("Wallet locked — reconnect with passkey");
  };

  return (
    <WalletShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-fuchsia-400" />
            Wallet settings
          </h1>
          <p className="text-xs text-gray-500 dark:text-white/40 mt-1">
            Security & privacy for your passkey wallet. Self-custody — keys never
            leave your device.
          </p>
        </div>

        {/* Security model */}
        <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Fingerprint className="w-3.5 h-3.5" /> Passkey protection
          </p>
          <ul className="text-sm text-gray-700 dark:text-white/75 space-y-1.5">
            <li className="flex gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              Face ID / Touch ID required to unlock & sign
            </li>
            <li className="flex gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              Switching wallets requires a fresh passkey signature
            </li>
            <li className="flex gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              No seed phrase stored on our servers
            </li>
            <li className="flex gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              You control the device passkey — we can&apos;t move funds
            </li>
          </ul>
        </section>

        {/* Privacy */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Privacy
          </p>
          <button
            type="button"
            onClick={toggleHide}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {hideBalances ? (
                <EyeOff className="w-4 h-4 text-fuchsia-400" />
              ) : (
                <Eye className="w-4 h-4 text-gray-400" />
              )}
              Hide balances everywhere
            </span>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                hideBalances
                  ? "bg-fuchsia-500/20 text-fuchsia-300"
                  : "bg-black/5 dark:bg-white/10 text-gray-500"
              }`}
            >
              {hideBalances ? "On" : "Off"}
            </span>
          </button>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Masks SOL, USDC, token amounts, and USD values in the navbar, wallet,
            portfolio, find-wallet list, and send screens on this device.
          </p>
        </section>

        {/* Navigation chrome */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <PanelLeft className="w-3.5 h-3.5" /> App menu style
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Choose how the full app list opens from the bottom bar (and desktop
            Menu). Default is the More tray; left drawer matches X / LinkedIn.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMenuStyle("more");
                writeNavMenuStyle("more");
                toast.success("More tray menu");
              }}
              className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition min-h-[88px] ${
                menuStyle === "more"
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
              }`}
            >
              <LayoutGrid
                className={`w-5 h-5 ${
                  menuStyle === "more" ? "text-fuchsia-400" : "text-gray-400"
                }`}
              />
              <span className="text-sm font-semibold">More tray</span>
              <span className="text-[11px] text-gray-500 leading-snug">
                Bottom sheet with groups, A–Z, custom order
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuStyle("sidebar");
                writeNavMenuStyle("sidebar");
                toast.success("Left side menu on");
              }}
              className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition min-h-[88px] ${
                menuStyle === "sidebar"
                  ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
              }`}
            >
              <PanelLeft
                className={`w-5 h-5 ${
                  menuStyle === "sidebar" ? "text-fuchsia-400" : "text-gray-400"
                }`}
              />
              <span className="text-sm font-semibold">Left menu</span>
              <span className="text-[11px] text-gray-500 leading-snug">
                X / LinkedIn style drawer under the chrome
              </span>
            </button>
          </div>
          {menuStyle === "sidebar" && (
            <p className="text-[11px] text-violet-600 dark:text-violet-300 font-medium">
              Tap the sol.new logo to open the left menu.
            </p>
          )}
        </section>

        {/* Bottom bar tabs */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" /> Bottom bar (phone)
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Pick 4 apps for the phone tab bar. The 5th slot is always Menu / More.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {bottomTabs.map((href, idx) => {
              const cand = bottomNavCandidates().find((c) => c.href === href);
              return (
                <div
                  key={`${href}-${idx}`}
                  className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-1.5 py-2 text-center"
                >
                  <p className="text-[10px] text-gray-400 mb-0.5">#{idx + 1}</p>
                  <p className="text-[11px] font-semibold truncate text-gray-900 dark:text-white">
                    {cand?.label || href}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((slot) => (
              <label key={slot} className="block space-y-1">
                <span className="text-[11px] font-medium text-gray-500">
                  Slot {slot + 1}
                </span>
                <select
                  value={bottomTabs[slot] || BOTTOM_NAV_DEFAULT[slot]}
                  onChange={(e) => {
                    const next = [...bottomTabs];
                    next[slot] = e.target.value;
                    // avoid duplicate hrefs — swap if taken
                    const dup = next.findIndex((h, i) => i !== slot && h === e.target.value);
                    if (dup >= 0) next[dup] = bottomTabs[slot];
                    setBottomTabs(next);
                    writeBottomNavHrefs(next);
                    toast.success("Bottom bar updated");
                  }}
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm text-gray-900 dark:text-white"
                >
                  {bottomNavCandidates().map((c) => (
                    <option key={c.href} value={c.href}>
                      {c.label} — {c.desc}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              clearBottomNavHrefs();
              setBottomTabs([...BOTTOM_NAV_DEFAULT]);
              toast.success("Bottom bar reset");
            }}
            className="w-full min-h-[40px] rounded-xl text-sm font-medium text-gray-600 dark:text-white/60 border border-black/10 dark:border-white/10"
          >
            Reset bottom bar to default
          </button>
        </section>

        {/* Auto-lock */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Auto-lock
          </p>
          <p className="text-xs text-gray-500">
            Disconnect after inactivity. Unlock again with your passkey.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { m: 0, label: "Off" },
              { m: 5, label: "5m" },
              { m: 15, label: "15m" },
              { m: 30, label: "30m" },
              { m: 60, label: "1h" },
            ].map(({ m, label }) => (
              <button
                key={m}
                type="button"
                onClick={() => setLock(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  autoLockMin === m
                    ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-200"
                    : "border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={lockNow}
            disabled={!publicKey}
            className="w-full min-h-[44px] rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-semibold disabled:opacity-40"
          >
            Lock wallet now
          </button>
        </section>

        {/* Accounts on device */}
        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Accounts on this device
          </p>
          {wallets.length === 0 ? (
            <p className="text-sm text-gray-500">No wallets saved yet.</p>
          ) : (
            <ul className="space-y-2">
              {wallets.map((w) => (
                <li
                  key={w.pubkey}
                  className="flex items-center gap-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2"
                >
                  <Wallet className="w-4 h-4 text-fuchsia-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate">
                      {w.pubkey.slice(0, 6)}…{w.pubkey.slice(-4)}
                      {publicKey === w.pubkey && (
                        <span className="ml-1.5 text-[10px] text-emerald-500 font-sans font-semibold">
                          ACTIVE
                        </span>
                      )}
                    </p>
                  </div>
                  {publicKey !== w.pubkey && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void switchWallet(w.pubkey)}
                      className="text-[11px] text-violet-500 font-medium"
                    >
                      Switch
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove from this device"
                    onClick={() => {
                      removeWallet(w.pubkey);
                      toast.info("Removed from this device (passkey remains in system)");
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/wallet/find"
            className="text-xs text-violet-500 font-medium inline-flex items-center gap-1"
          >
            Find / add another passkey wallet <ExternalLink className="w-3 h-3" />
          </Link>
        </section>

        {/* KYC / compliance clarity */}
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Identity & KYC
          </p>
          <p className="text-sm text-gray-700 dark:text-white/70 leading-relaxed">
            sol.new wallets are <strong>self-custodial</strong>. We never hold your
            keys or balance, so there is no platform KYC to “activate” the wallet —
            security is your device passkey + Face ID.
          </p>
          <p className="text-sm text-gray-700 dark:text-white/70 leading-relaxed">
            Optional third-party ramps (e.g. Stripe credits, bank partners) may ask
            for their own verification when you buy or cash out. That is separate
            from unlocking your on-chain wallet.
          </p>
          <p className="text-xs text-gray-500 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Never share your device passcode. We will never ask for it.
          </p>
        </section>
      </div>
    </WalletShell>
  );
}
