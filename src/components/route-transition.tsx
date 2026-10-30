"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const DURATION_MS = 320;

/**
 * Soft page enter — opacity + light vertical slide (not horizontal).
 * Horizontal slides glitch sticky chrome / fixed UI on Seeker.
 * Respects prefers-reduced-motion.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [phase, setPhase] = useState<"in" | "out">("in");
  const first = useRef(true);
  const reduceRef = useRef(false);

  useEffect(() => {
    try {
      reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduceRef.current = false;
    }
  }, []);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }

    if (first.current) {
      first.current = false;
      return;
    }

    if (reduceRef.current) return;

    setPhase("out");
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("in"));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const reduce = reduceRef.current;
  const shown = phase === "in";

  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full overflow-x-clip">
      <div
        className="relative flex-1 flex flex-col min-h-0 w-full"
        style={{
          opacity: reduce || shown ? 1 : 0,
          transform: reduce || shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
          transition: reduce
            ? undefined
            : `opacity ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          willChange: shown ? "auto" : "opacity, transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
