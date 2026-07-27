"use client";

import { motion, useReducedMotion } from "motion/react";

/** Default page enter: soft slide + fade (disabled when reduced motion). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, x: reduce ? 0 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.25,
        ease: [0.22, 1, 0.36, 1],
        delay: reduce ? 0 : delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
