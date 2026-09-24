"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  ExternalLink,
  LogOut,
  Bell,
  BellOff,
  Droplets,
  Zap,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Spinner } from "@/components/spinner";

export type WalletSheetEntry = {
  pubkey: string;
  label?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  address: string;
  label?: string;
  balanceSol?: number | null;
  balanceLoading?: boolean;
  balanceDisplay?: ReactNode;
  networkLabel?: string;
  isDevnet?: boolean;
  copied?: boolean;
  defaultToken?: "SOL" | "USDC";
  onDefaultToken?: (t: "SOL" | "USDC") => void;
  wallets?: WalletSheetEntry[];
  onSwitchWallet?: (pubkey: string) => void;
  pushPermission?: "default" | "granted" | "denied" | "unsupported";
  pushLoading?: boolean;
  onTogglePush?: () => void;
  airdropping?: boolean;
  airdropDone?: boolean;
  onAirdrop?: () => void;
  onCopy?: () => void;
  onSend?: () => void;
  onReceive?: () => void;
  onPrivate?: () => void;
  onViewAddress?: () => void;
  onWallet?: () => void;
  onPortfolio?: () => void;
  onSettings?: () => void;
  onLabelWallets?: () => void;
  onFindWallet?: () => void;
  onRefresh?: () => void;
  onDisconnect?: () => void;
};

/**
 * Calm wallet sheet — essentials first, extras behind one tap.
 */
export function WalletInfoModal({
  open,
  onClose,
  address,
  label,
  balanceSol,
  balanceLoading,
  balanceDisplay,
  networkLabel = "mainnet",
  isDevnet,
  copied,
  defaultToken = "SOL",
  onDefaultToken,
  wallets = [],
  onSwitchWallet,
  pushPermission = "unsupported",
  pushLoading,
  onTogglePush,
  airdropping,
  airdropDone,
  onAirdrop,
  onCopy,
  onSend,
  onReceive,
  onPrivate,
  onViewAddress,
  onWallet,
  onPortfolio,
  onSettings,
  onLabelWallets,
  onFindWallet,
  onRefresh,
  onDisconnect,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setMoreOpen(false);
      return;
    }
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
  const otherWallets = wallets.filter((w) => w.pubkey !== address);

  return (
    <div className="fixed-vv z-[200] flex flex-col justify-end sm:justify-start sm:items-center sm:pt-[max(10%,calc(var(--sat)+1.5rem))]">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full sm:w-[min(100%-1.5rem,22rem)] max-h-sheet flex flex-col">
        <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-full pb-[env(safe-area-inset-bottom)]">
          <div className="sm:hidden flex justify-center pt-2.5 shrink-0" aria-hidden>
            <span className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/20" />
          </div>

          {/* Identity — compact */}
          <div className="px-4 pt-2 pb-1 flex items-start justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {display}
                </p>
                <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md border border-black/10 dark:border-white/10 text-gray-400 shrink-0">
                  {networkLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onCopy}
                className="mt-0.5 text-[11px] font-mono text-gray-400 hover:text-purple-500 touch-manipulation"
                title="Copy address"
              >
                {short} {copied ? "✓" : ""}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 touch-manipulation active:scale-95 shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain min-h-0">
            {/* Balance */}
            <div className="px-4 pt-2 pb-3 text-center">
              {balanceDisplay != null ? (
                balanceDisplay
              ) : balanceLoading || balanceSol == null ? (
                <p className="text-sm font-mono text-purple-500 inline-flex items-center gap-1.5 justify-center">
                  <Spinner size={14} /> fetching…
                </p>
              ) : (
                <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white tracking-tight">
                  {balanceSol.toFixed(balanceSol < 1 ? 4 : 3)}
                  <span className="text-base font-semibold text-gray-400 ml-1">SOL</span>
                </p>
              )}
            </div>

            {/* Primary actions — 4 only */}
            <div className="grid grid-cols-4 gap-2 px-3 pb-3">
              {(
                [
                  { icon: ArrowUpRight, label: "Send", fn: onSend },
                  { icon: ArrowDownLeft, label: "Receive", fn: onReceive },
                  { icon: EyeOff, label: "Private", fn: onPrivate },
                  { icon: Wallet, label: "Wallet", fn: onWallet },
                ] as const
              ).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.fn}
                  className="flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-purple-500/10 transition touch-manipulation active:scale-95"
                >
                  <a.icon size={18} className="text-purple-500" />
                  <span className="text-[11px] font-medium text-gray-600 dark:text-white/60">
                    {a.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Secondary — 3 calm rows */}
            <div className="mx-3 mb-2 rounded-xl border border-black/5 dark:border-white/5 overflow-hidden divide-y divide-black/5 dark:divide-white/5">
              <button
                type="button"
                onClick={onPortfolio}
                className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70 touch-manipulation active:bg-black/[0.03]"
              >
                <FolderOpen size={15} className="text-gray-400" /> Portfolio
              </button>
              <button
                type="button"
                onClick={onSettings || onLabelWallets}
                className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70 touch-manipulation active:bg-black/[0.03]"
              >
                <Settings size={15} className="text-gray-400" /> Settings
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70 touch-manipulation active:bg-black/[0.03]"
              >
                {copied ? (
                  <Check size={15} className="text-emerald-500" />
                ) : (
                  <Copy size={15} className="text-gray-400" />
                )}
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>

            {/* Switch wallet — only if others exist, compact */}
            {otherWallets.length > 0 && (
              <div className="px-3 pb-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold px-1 mb-1.5">
                  Switch
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {otherWallets.slice(0, 6).map((w) => {
                    const name =
                      w.label && w.label !== w.pubkey
                        ? w.label
                        : `${w.pubkey.slice(0, 4)}…${w.pubkey.slice(-4)}`;
                    return (
                      <button
                        key={w.pubkey}
                        type="button"
                        onClick={() => onSwitchWallet?.(w.pubkey)}
                        className="min-h-[36px] px-2.5 rounded-lg text-xs font-medium border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-purple-400/40 hover:text-purple-600 touch-manipulation active:scale-95 truncate max-w-[46%]"
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* More — collapsed by default */}
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center justify-center gap-1 w-full min-h-[40px] text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-white/60 touch-manipulation"
              >
                More
                {moreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {moreOpen && (
                <div className="rounded-xl border border-black/5 dark:border-white/5 overflow-hidden divide-y divide-black/5 dark:divide-white/5 mb-1">
                  <button
                    type="button"
                    onClick={onViewAddress || onReceive}
                    className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70"
                  >
                    <ExternalLink size={15} className="text-gray-400" /> View address
                  </button>
                  <button
                    type="button"
                    onClick={onFindWallet}
                    className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70"
                  >
                    <Search size={15} className="text-gray-400" /> Find wallet…
                  </button>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70"
                  >
                    <RefreshCw size={15} className="text-gray-400" /> Refresh balance
                  </button>

                  {onDefaultToken && (
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      <span className="text-xs text-gray-400 shrink-0">Currency</span>
                      <div className="flex gap-1 flex-1">
                        {(["SOL", "USDC"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onDefaultToken(t)}
                            className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold border ${
                              defaultToken === t
                                ? "bg-purple-500/15 border-purple-400/50 text-purple-700 dark:text-purple-300"
                                : "border-black/10 dark:border-white/10 text-gray-500"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isDevnet && onAirdrop && (
                    <button
                      type="button"
                      onClick={onAirdrop}
                      disabled={airdropping}
                      className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-amber-600 dark:text-amber-400 disabled:opacity-50"
                    >
                      {airdropDone ? <Zap size={15} /> : <Droplets size={15} />}
                      {airdropping
                        ? "Airdropping…"
                        : airdropDone
                          ? "0.1 SOL sent"
                          : "Airdrop 0.1 SOL"}
                    </button>
                  )}

                  {pushPermission !== "unsupported" && onTogglePush && (
                    <button
                      type="button"
                      onClick={onTogglePush}
                      disabled={pushLoading || pushPermission === "denied"}
                      className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-gray-700 dark:text-white/70 disabled:opacity-40"
                    >
                      {pushLoading ? (
                        <Spinner size={14} />
                      ) : pushPermission === "granted" ? (
                        <BellOff size={15} className="text-gray-400" />
                      ) : (
                        <Bell size={15} className="text-gray-400" />
                      )}
                      {pushPermission === "granted"
                        ? "Turn off notifications"
                        : pushPermission === "denied"
                          ? "Notifications blocked"
                          : "Enable notifications"}
                    </button>
                  )}

                  {onDisconnect && (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="flex items-center gap-3 w-full min-h-[44px] px-3 text-sm text-red-500"
                    >
                      <LogOut size={15} /> Disconnect
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
