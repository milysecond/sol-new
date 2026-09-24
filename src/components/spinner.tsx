"use client";

import { SolOrb, type SolOrbState } from "@/components/sol-orb";

type SpinnerProps = {
  /** CSS px */
  size?: number;
  className?: string;
  /** Brand orb motion */
  state?: SolOrbState;
  /** aria label */
  label?: string;
};

/**
 * sol.new brand spinner — first-party SolOrb (not thinking-orbs).
 */
export function Spinner({
  size = 20,
  className = "",
  state = "working",
  label = "Loading",
}: SpinnerProps) {
  return (
    <SolOrb size={size} state={state} className={className} label={label} />
  );
}
