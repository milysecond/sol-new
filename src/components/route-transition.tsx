"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Soft page enter — opacity only (no slide / transform).
 * Horizontal slides were glitchy on Seeker + sticky chrome and trapped fixed UI.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [visible, setVisible] = useState(true);
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

    // Brief fade-in without transform (safe for sticky headers + portals)
    setVisible(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0 w-full"
      style={{
        opacity: visible ? 1 : 0,
        transition: reduceRef.current ? undefined : "opacity 140ms ease-out",
        // Never leave a CSS transform — fixed menus / bottom nav stay correct
        transform: "none",
        willChange: visible ? "auto" : "opacity",
      }}
    >
      {children}
    </div>
  );
}
