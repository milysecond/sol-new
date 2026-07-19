"use client";

import { motion, useReducedMotion } from "motion/react";

// Wallet tabs are visited tens of times a day — keep transitions to a fast
// fade, no positional movement (per animation frequency guidelines).
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut", delay: reduce ? 0 : delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
