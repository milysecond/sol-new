"use client";

/**
 * Local page section enter — soft slide-up + fade (slower, calmer).
 * Does not fight sticky chrome (only content block, not full viewport).
 */
export function PageTransition({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full min-w-0 animate-page-enter ${className}`.trim()}>
      {children}
    </div>
  );
}

/** Soft enter without layout thrash. */
export function FadeIn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return <div className={`animate-page-enter ${className}`}>{children}</div>;
}
