"use client";

import { useEffect, type ReactNode } from "react";
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
  Tag,
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
  /** Default currency */
  defaultToken?: "SOL" | "USDC";
  onDefaultToken?: (t: "SOL" | "USDC") => void;
  /** Wallets to switch */
  wallets?: WalletSheetEntry[];
  onSwitchWallet?: (pubkey: string) => void;
  /** Push */
  pushPermission?: "default" | "granted" | "denied" | "unsupported";
  pushLoading?: boolean;
  onTogglePush?: () => void;
  /** Devnet airdrop */
  airdropping?: boolean;
  airdropDone?: boolean;
  onAirdrop?: () => void;
  /** Nav / actions */
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

function Row({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  trailing,
}: {
  icon: typeof Wallet;
  label: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 w-full min-h-[48px] px-4 text-left text-sm transition touch-manipulation active:bg-black/5 dark:active:bg-white/5 disabled:opacity-40 ${
        danger
          ? "text-red-500"
          : "text-gray-800 dark:text-white/75"
      }`}
    >
      <Icon size={16} className="shrink-0 opacity-70" />
      <span className="flex-1 min-w-0">{label}</span>
      {trailing}
    </button>
  );
}

/**
 * Full wallet sheet — parity with the old header dropdown + quick actions.
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
    <div className="fixed-vv z-[200] flex flex-col justify-end sm:justify-start sm:items-center sm:pt-[max(8%,calc(var(--sat)+1.25rem))]">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full sm:w-[min(100%-1.25rem,24rem)] max-h-sheet-tall flex flex-col">
        <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-full pb-[env(safe-area-inset-bottom)]">
          <div className="sm:hidden flex justify-center pt-2.5 shrink-0" aria-hidden>
            <span className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/20" />
          </div>

          {/* Header */}
          <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 border-b border-black/5 dark:border-white/5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 text-purple-500 inline-flex items-center justify-center shrink-0">
                <Wallet size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {display}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-white/40">
                  Tab title uses your address
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
            {/* Full address + balance */}
            <div className="px-4 pt-3 pb-2 space-y-2 border-b border-black/5 dark:border-white/5">
              <p
                className="text-[12px] font-mono font-semibold text-gray-900 dark:text-white break-all leading-snug select-all"
                title={address}
              >
                {address}
              </p>
              {label && label !== address && (
                <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 truncate">
                  {label}
                </p>
              )}
              <p className="text-[10px] text-gray-400">
                Label wallets in Settings · address stays the same
              </p>
              <div className="pt-1">
                {balanceDisplay != null ? (
                  balanceDisplay
                ) : balanceLoading || balanceSol == null ? (
                  <p className="text-sm font-mono text-purple-500 flex items-center gap-1.5">
                    <Spinner size={12} /> fetching…
                  </p>
                ) : (
                  <p className="text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400 tracking-tight">
                    {balanceSol.toFixed(balanceSol < 1 ? 4 : 3)}
                    <span className="text-sm font-semibold text-gray-400 ml-1">SOL</span>
                  </p>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-4 gap-2 px-3 py-3">
              {(
                [
                  { icon: ArrowUpRight, label: "Send", fn: onSend },
                  { icon: ArrowDownLeft, label: "Receive", fn: onReceive },
                  { icon: EyeOff, label: "Private", fn: onPrivate },
                  { icon: Copy, label: copied ? "Copied" : "Copy", fn: onCopy },
                ] as const
              ).map((a) => (
                <button
                  key={String(a.label)}
                  type="button"
                  onClick={a.fn}
                  className="flex flex-col items-center justify-center gap-1 min-h-[60px] rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-purple-500/10 border border-transparent hover:border-purple-400/30 transition touch-manipulation active:scale-95"
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

            {/* Primary links */}
            <div className="border-t border-black/5 dark:border-white/5 py-1">
              <Row icon={Wallet} label="Wallet" onClick={onWallet} />
              <Row icon={Tag} label="Label wallets…" onClick={onLabelWallets || onSettings} />
              <Row icon={FolderOpen} label="Portfolio" onClick={onPortfolio} />
              <Row icon={ExternalLink} label="View address" onClick={onViewAddress || onReceive} />
              <Row
                icon={Copy}
                label={copied ? "Copied!" : "Copy address"}
                onClick={onCopy}
                trailing={copied ? <Check size={14} className="text-emerald-500" /> : undefined}
              />
              <Row icon={Settings} label="Wallet settings" onClick={onSettings} />
              <Row icon={RefreshCw} label="Refresh balance" onClick={onRefresh} />
            </div>

            {/* Default currency */}
            {onDefaultToken && (
              <div className="px-4 py-3 border-t border-black/5 dark:border-white/5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 font-semibold">
                  Default currency
                </p>
                <div className="flex gap-1.5">
                  {(["SOL", "USDC"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onDefaultToken(t)}
                      className={`flex-1 min-h-[40px] rounded-xl px-2 text-xs font-semibold transition touch-manipulation active:scale-[0.98] border ${
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
            )}

            {/* Devnet airdrop */}
            {isDevnet && onAirdrop && (
              <div className="border-t border-black/5 dark:border-white/5 py-1">
                <Row
                  icon={airdropDone ? Zap : Droplets}
                  label={
                    airdropping
                      ? "Airdropping…"
                      : airdropDone
                        ? "0.1 SOL sent!"
                        : "Airdrop 0.1 SOL"
                  }
                  onClick={onAirdrop}
                  disabled={airdropping}
                />
              </div>
            )}

            {/* Notifications */}
            {pushPermission !== "unsupported" && onTogglePush && (
              <div className="border-t border-black/5 dark:border-white/5 py-1">
                <Row
                  icon={pushPermission === "granted" ? BellOff : Bell}
                  label={
                    pushLoading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner size={14} />
                        {pushPermission === "granted" ? "Turning off…" : "Enabling…"}
                      </span>
                    ) : pushPermission === "granted" ? (
                      "Turn off notifications"
                    ) : pushPermission === "denied" ? (
                      "Notifications blocked"
                    ) : (
                      "Enable notifications"
                    )
                  }
                  onClick={onTogglePush}
                  disabled={pushLoading || pushPermission === "denied"}
                />
              </div>
            )}

            {/* Switch wallet */}
            <div className="border-t border-black/5 dark:border-white/5 py-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 px-4 pt-2 pb-1 font-semibold">
                Switch wallet
              </p>
              {wallets.length > 0 ? (
                wallets.slice(0, 16).map((w) => {
                  const active = w.pubkey === address;
                  const name =
                    w.label && w.label !== w.pubkey
                      ? w.label
                      : `${w.pubkey.slice(0, 4)}…${w.pubkey.slice(-4)}`;
                  return (
                    <button
                      key={w.pubkey}
                      type="button"
                      onClick={() => onSwitchWallet?.(w.pubkey)}
                      className={`flex items-center justify-between w-full min-h-[48px] px-4 text-sm touch-manipulation active:bg-black/5 dark:active:bg-white/5 ${
                        active
                          ? "text-purple-600 dark:text-purple-400 font-semibold"
                          : "text-gray-700 dark:text-white/65"
                      }`}
                    >
                      <span className="truncate max-w-[55%] text-left">{name}</span>
                      <span className="text-[10px] font-mono text-gray-400 ml-2 shrink-0">
                        {w.pubkey.slice(0, 4)}…{w.pubkey.slice(-4)}
                        {active ? " ·" : ""}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-4 py-2 text-xs text-gray-400">No other wallets saved</p>
              )}
              <Row icon={Search} label="Find correct wallet…" onClick={onFindWallet} />
            </div>

            {/* Disconnect */}
            {onDisconnect && (
              <div className="border-t border-black/5 dark:border-white/5 py-1 pb-2">
                <Row icon={LogOut} label="Disconnect" onClick={onDisconnect} danger />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
