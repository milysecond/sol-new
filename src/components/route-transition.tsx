"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Mobile-native page slides: forward = enter from right, back = enter from left.
 * Clears transform after animation so fixed menus/portals aren't trapped
 * in a stacking context (wallet menu was painting under page content).
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const reduce = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);
  const [animating, setAnimating] = useState(false);
  const dirRef = useRef<1 | -1>(1);
  const stackRef = useRef<string[]>([pathname]);
  const first = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const stack = stackRef.current;
    const existing = stack.lastIndexOf(pathname);
    if (existing >= 0 && existing < stack.length - 1) {
      dirRef.current = -1;
      stackRef.current = stack.slice(0, existing + 1);
    } else {
      dirRef.current = 1;
      if (stack[stack.length - 1] !== pathname) {
        stackRef.current = [...stack, pathname].slice(-40);
      }
    }
    if (!first.current) setAnimating(true);
    first.current = false;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  const dir = dirRef.current;
  const slide = isMobile && !reduce;

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-x-clip">
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={pathname}
          custom={dir}
          initial={
            reduce
              ? { opacity: 1 }
              : slide
                ? { x: dir > 0 ? "28%" : "-28%", opacity: 0.85 }
                : { opacity: 0, y: 6 }
          }
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={
            reduce
              ? { opacity: 1 }
              : slide
                ? { x: dir > 0 ? "-18%" : "18%", opacity: 0.7 }
                : { opacity: 0 }
          }
          transition={
            reduce
              ? { duration: 0 }
              : slide
                ? { type: "spring", stiffness: 420, damping: 38, mass: 0.85 }
                : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
          }
          onAnimationComplete={() => setAnimating(false)}
          className="flex-1 flex flex-col w-full min-h-0"
          // Drop transform after settle so fixed dropdowns/portals use the viewport
          style={{
            WebkitOverflowScrolling: "touch",
            ...(animating || reduce ? {} : { transform: "none" }),
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
