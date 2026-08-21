"use client";

import { useEffect } from "react";
import {
  Wallet,
  Copy,
  Check,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
  EyeOff,
  X,
  RefreshCw,
  FolderOpen,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  address: string;
  label?: string;
  balanceSol?: number | null;
  networkLabel?: string;
  onCopy?: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onPrivate?: () => void;
  onSettings?: () => void;
  onRefresh?: () => void;
  onWallet?: () => void;
  onPortfolio?: () => void;
  copied?: boolean;
};

/**
 * Mobile-first wallet sheet — visual-viewport pinned.
 */
export function WalletInfoModal({
  open,
  onClose,
  address,
  label,
  balanceSol,
  networkLabel = "mainnet",
  onCopy,
  onSend,
  onReceive,
  onPrivate,
  onSettings,
  onRefresh,
  onWallet,
  onPortfolio,
  copied,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  const display = label && label !== address ? label : short;

  return (
    <div className="fixed-vv z-[200] flex flex-col justify-end sm:justify-start sm:items-center sm:pt-[max(12%,calc(var(--sat)+2rem))]">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full sm:w-[min(100%-1.5rem,22rem)] max-h-sheet-tall flex flex-col">
        <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-full pb-[env(safe-area-inset-bottom)]">
          <div className="sm:hidden flex justify-center pt-2.5 shrink-0" aria-hidden>
            <span className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/20" />
          </div>

          <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 border-b border-black/5 dark:border-white/5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 text-purple-500 inline-flex items-center justify-center shrink-0">
                <Wallet size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {display}
                </p>
                <p className="text-[11px] font-mono text-gray-500 dark:text-white/40 truncate">
                  {short}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-black/10 dark:border-white/10 text-gray-500">
                {networkLabel}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 touch-manipulation active:scale-95"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto overscroll-contain min-h-0">
            <div className="px-4 py-4 text-center space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                Balance
              </p>
              <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white tracking-tight">
                {balanceSol == null ? "—" : balanceSol.toFixed(balanceSol < 1 ? 4 : 3)}
                <span className="text-base font-semibold text-gray-400 ml-1">SOL</span>
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 px-3 pb-3">
              {(
                [
                  { icon: ArrowUpRight, label: "Send", fn: onSend },
                  { icon: ArrowDownLeft, label: "Receive", fn: onReceive },
                  { icon: EyeOff, label: "Private", fn: onPrivate },
                  { icon: Copy, label: copied ? "Copied" : "Copy", fn: onCopy },
                ] as const
              ).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.fn}
                  className="flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-purple-500/10 border border-transparent hover:border-purple-400/30 transition touch-manipulation active:scale-95"
                >
                  {a.label === "Copied" ? (
                    <Check size={18} className="text-emerald-500" />
                  ) : (
                    <a.icon size={18} className="text-purple-500" />
                  )}
                  <span className="text-[11px] font-medium text-gray-600 dark:text-white/60">
                    {a.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-black/5 dark:border-white/5 px-2 py-1.5 grid grid-cols-2 sm:grid-cols-4 gap-0.5">
              {(
                [
                  { icon: Wallet, label: "Wallet", fn: onWallet },
                  { icon: FolderOpen, label: "Portfolio", fn: onPortfolio },
                  { icon: RefreshCw, label: "Refresh", fn: onRefresh },
                  { icon: Settings, label: "Settings", fn: onSettings },
                ] as const
              ).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.fn}
                  className="flex items-center justify-center gap-1.5 min-h-[48px] text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white/80 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 touch-manipulation active:scale-95"
                >
                  <a.icon size={14} /> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
