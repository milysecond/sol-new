"use client";

import { type ReactNode, useEffect } from "react";
import { CheckCircle2, X, AlertTriangle, Info } from "lucide-react";
import { ActionButton, type ActionButtonState } from "@/components/action-button";

export type FeedbackTone = "success" | "error" | "info" | "warning";

type Props = {
  open: boolean;
  onClose: () => void;
  tone?: FeedbackTone;
  title: string;
  body?: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  buttonState?: ActionButtonState;
};

const toneUi: Record<
  FeedbackTone,
  { icon: typeof CheckCircle2; wrap: string; iconCls: string }
> = {
  success: {
    icon: CheckCircle2,
    wrap: "bg-emerald-500/15 text-emerald-500",
    iconCls: "text-emerald-500",
  },
  error: {
    icon: AlertTriangle,
    wrap: "bg-red-500/15 text-red-500",
    iconCls: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    wrap: "bg-amber-500/15 text-amber-500",
    iconCls: "text-amber-500",
  },
  info: {
    icon: Info,
    wrap: "bg-purple-500/15 text-purple-500",
    iconCls: "text-purple-500",
  },
};

/**
 * Family-style feedback drawer — success/error after an action.
 * Bottom sheet on mobile feel via fixed panel + opacity.
 */
export function FeedbackModal({
  open,
  onClose,
  tone = "success",
  title,
  body,
  primaryLabel = "Done",
  onPrimary,
  secondaryLabel,
  onSecondary,
  buttonState = "idle",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const t = toneUi[tone];
  const Icon = t.icon;

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="fixed z-[91] left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 w-full sm:max-w-md px-3 sm:px-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0"
      >
        <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl p-5 space-y-4 animate-[fadeIn_0.18s_ease-out]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 ${t.wrap}`}
              >
                <Icon size={22} className={t.iconCls} />
              </div>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  {title}
                </h3>
                {body && (
                  <div className="text-sm text-gray-500 dark:text-white/50 mt-1 leading-relaxed">
                    {body}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 touch-manipulation"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <ActionButton
              state={buttonState}
              idleLabel={primaryLabel}
              onClick={() => {
                onPrimary?.();
                if (!onPrimary) onClose();
              }}
            />
            {secondaryLabel && (
              <button
                type="button"
                onClick={() => {
                  onSecondary?.();
                  if (!onSecondary) onClose();
                }}
                className="min-h-[44px] rounded-xl text-sm font-medium text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition touch-manipulation"
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
