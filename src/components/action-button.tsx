"use client";

import { type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

export type ActionButtonState = "idle" | "loading" | "success" | "error";

type Props = {
  state?: ActionButtonState;
  idleLabel: ReactNode;
  loadingLabel?: ReactNode;
  successLabel?: ReactNode;
  errorLabel?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  /** Soft haptic on press when available */
  haptic?: boolean;
  type?: "button" | "submit";
};

function tap(haptic: boolean) {
  if (!haptic) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Compact stateful CTA — idle → loading → success/error.
 * Touch-friendly: 48px min height, scale press, no layout jump.
 */
export function ActionButton({
  state = "idle",
  idleLabel,
  loadingLabel = "Working…",
  successLabel = "Done",
  errorLabel = "Try again",
  disabled,
  onClick,
  className = "",
  haptic = true,
  type = "button",
}: Props) {
  const busy = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";

  const label =
    state === "loading"
      ? loadingLabel
      : state === "success"
        ? successLabel
        : state === "error"
          ? errorLabel
          : idleLabel;

  return (
    <button
      type={type}
      disabled={disabled || busy || isSuccess}
      onClick={() => {
        if (disabled || busy || isSuccess) return;
        tap(haptic);
        onClick?.();
      }}
      className={[
        "w-full inline-flex items-center justify-center gap-2 px-4 min-h-[48px]",
        "rounded-xl font-semibold text-sm select-none touch-manipulation",
        "transition-[transform,background-color,opacity,box-shadow] duration-150",
        "active:scale-[0.98] disabled:cursor-not-allowed",
        isSuccess
          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25"
          : isError
            ? "bg-red-500 hover:bg-red-400 active:bg-red-600 text-white"
            : busy
              ? "bg-purple-500 text-white opacity-90"
              : "bg-purple-500 hover:bg-purple-400 active:bg-purple-600 text-white shadow-sm shadow-purple-500/20",
        disabled && !busy && !isSuccess ? "opacity-50" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {busy && <Loader2 size={18} className="animate-spin shrink-0" />}
      {isSuccess && <Check size={18} className="shrink-0" strokeWidth={2.5} />}
      <span className="truncate">{label}</span>
    </button>
  );
}
