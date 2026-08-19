/**
 * Centered page content shell — desktop-friendly.
 * Use instead of `sm:items-center` + `w-full sm:max-w-*` (that left-sticks content).
 */
import { PageTransition } from "@/components/page-transition";

const MAX = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const;

export type PageShellMax = keyof typeof MAX;

export function PageShell({
  children,
  max = "lg",
  className = "",
  innerClassName = "",
  bare = false,
}: {
  children: React.ReactNode;
  max?: PageShellMax;
  className?: string;
  innerClassName?: string;
  /** Skip PageTransition wrapper */
  bare?: boolean;
}) {
  const inner = (
    <div
      className={`mx-auto w-full min-w-0 ${MAX[max]} px-4 sm:px-6 py-5 sm:py-8 ${innerClassName}`.trim()}
    >
      {children}
    </div>
  );

  return (
    <main
      className={`flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12 ${className}`.trim()}
    >
      {bare ? inner : <PageTransition className="w-full min-w-0">{inner}</PageTransition>}
    </main>
  );
}
