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
} from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { useWallet } from "@/lib/wallet-context";
import { toast } from "@/lib/toast";

const HIDE_BAL_KEY = "sol.new.privacy.hideBalances";
const AUTO_LOCK_KEY = "sol.new.security.autoLockMin";

function readHideBalances(): boolean {
  try {
    return localStorage.getItem(HIDE_BAL_KEY) === "1";
  } catch {
    return false;
  }
}

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
  const [hideBalances, setHideBalances] = useState(false);
  const [autoLockMin, setAutoLockMin] = useState(15);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setHideBalances(readHideBalances());
    setAutoLockMin(readAutoLock());
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
    setHideBalances((v) => {
      const next = !v;
      try {
        localStorage.setItem(HIDE_BAL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      // Notify other tabs / wallet shell via storage event
      window.dispatchEvent(new Event("sol.new.privacy"));
      return next;
    });
  }, []);

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
              Hide balances on this device
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
