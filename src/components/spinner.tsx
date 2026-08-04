"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";

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
 * Global loading indicator — Thinking Orbs (orbs.jakubantalik.com).
 * Drop-in for all previous SVG spinners.
 */
export function Spinner({
  size = 20,
  className = "",
  state = "working",
  label = "Loading",
}: SpinnerProps) {
  // Package ships only two tuned presets
  const orbSize = size >= 40 ? 64 : 20;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: orbSize, height: orbSize }}
    >
      <ThinkingOrb
        state={state}
        size={orbSize}
        theme="auto"
        aria-label={label}
      />
    </span>
  );
}
