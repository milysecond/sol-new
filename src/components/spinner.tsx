"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { useTheme } from "@/lib/theme-context";

type SpinnerProps = {
  /** CSS px hint — mapped to orb presets 20 | 64 */
  size?: number;
  className?: string;
  /** thinking-orbs state */
  state?: OrbState;
  /** aria label */
  label?: string;
};

/**
 * Brand-tinted Thinking Orb (violet = sol.new purple).
 * Package is mono; colorize via CSS filter.
 */
export function Spinner({
  size = 20,
  className = "",
  state = "working",
  label = "Loading",
}: SpinnerProps) {
  const orbSize = size >= 40 ? 64 : 20;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // #a855f7 / #c084fc family
  const brandFilter = isDark
    ? "brightness(0) saturate(100%) invert(72%) sepia(42%) saturate(1200%) hue-rotate(220deg) brightness(105%) contrast(98%)"
    : "brightness(0) saturate(100%) invert(38%) sepia(70%) saturate(1400%) hue-rotate(240deg) brightness(95%) contrast(98%)";

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: orbSize, height: orbSize }}
    >
      <ThinkingOrb
        state={state}
        size={orbSize}
        theme={isDark ? "dark" : "light"}
        aria-label={label}
        style={{ filter: brandFilter }}
      />
    </span>
  );
}
