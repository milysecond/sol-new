/**
 * Centered page content shell — desktop-friendly.
 * Mobile stays compact; lg+ and xl open up so pages aren't phone-narrow.
 */
import { PageTransition } from "@/components/page-transition";

/** Fixed max widths */
const MAX_FIXED = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const;

/**
 * Responsive presets — preferred for app pages.
 * - app: default tool pages (gift, pay, portfolio…)
 * - wide: explorer/scan/home grids
 * - narrow: forms that should stay short (claim secret, etc.)
 */
const MAX_RESPONSIVE = {
  narrow: "max-w-md lg:max-w-lg",
  app: "max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl",
  wide: "max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl",
} as const;

const MAX = { ...MAX_FIXED, ...MAX_RESPONSIVE } as const;

export type PageShellMax = keyof typeof MAX;

/** Shared outer content width classes (also available as `.app-shell` in CSS). */
export const APP_SHELL_CLASS =
  "mx-auto w-full min-w-0 max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl px-4 sm:px-6 lg:px-8";

export const APP_SHELL_WIDE_CLASS =
  "mx-auto w-full min-w-0 max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl px-4 sm:px-6 lg:px-8";

export function PageShell({
  children,
  max = "app",
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
      className={`mx-auto w-full min-w-0 ${MAX[max]} px-4 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-10 ${innerClassName}`.trim()}
    >
      {children}
    </div>
  );

  return (
    <main
      className={`flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12 lg:pb-16 ${className}`.trim()}
    >
      {bare ? inner : <PageTransition className="w-full min-w-0">{inner}</PageTransition>}
    </main>
  );
}
