"use client";

import { type ReactNode } from "react";
import { Shield, ArrowRight, ShieldOff, Network } from "lucide-react";

export type TxConfirmRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

type Props = {
  title: string;
  subtitle?: string;
  kind?: "shield" | "send" | "unshield" | "generic";
  rows: TxConfirmRow[];
  notice?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const kindIcon = {
  shield: Shield,
  send: ArrowRight,
  unshield: ShieldOff,
  generic: Network,
} as const;

/**
 * Pre-submit confirmation card — amount, network, fee, recipient.
 * Opacity-only feel; keeps sol.new compact density.
 */
export function TxConfirm({
  title,
  subtitle,
  kind = "generic",
  rows,
  notice,
  confirmLabel = "Confirm",
  cancelLabel = "Back",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const Icon = kindIcon[kind];

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-500 inline-flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-white/45 mt-0.5 leading-snug">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/10 overflow-hidden">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-black/[0.02] dark:bg-white/[0.03]"
          >
            <span className="text-xs text-gray-500 dark:text-white/45 shrink-0">{r.label}</span>
            <span
              className={`text-xs font-medium text-gray-900 dark:text-white text-right truncate min-w-0 ${
                r.mono ? "font-mono tabular-nums" : ""
              }`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {notice && (
        <p className="text-[11px] text-amber-800 dark:text-amber-200/90 leading-relaxed rounded-lg bg-amber-500/10 border border-amber-400/25 px-3 py-2">
          {notice}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex-1 min-h-[44px] rounded-xl border border-black/10 dark:border-white/15 text-sm font-medium text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98] transition touch-manipulation disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex-[1.4] min-h-[44px] rounded-xl bg-purple-500 hover:bg-purple-400 active:bg-purple-600 active:scale-[0.98] text-white text-sm font-semibold transition touch-manipulation disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
