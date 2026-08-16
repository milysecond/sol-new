"use client";

/**
 * Local page wrapper — no transform animations (they fought RouteTransition
 * and sticky chrome on Seeker). RouteTransition handles a light opacity fade.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>;
}

/** Soft enter without transform — opacity only. */
export function FadeIn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return <div className={`animate-[fadeIn_0.2s_ease-out] ${className}`}>{children}</div>;
}
