"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

interface AnimatedIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

/**
 * Decorative icon. pointer-events-none so parent Links always receive taps on mobile
 * (hover-only motion does nothing useful on touch).
 */
export function AnimatedIcon({ icon: Icon, size = 40, className = "" }: AnimatedIconProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`inline-flex items-center justify-center pointer-events-none select-none ${className}`}
      aria-hidden
    >
      <Icon size={size} />
    </motion.div>
  );
}

export function PulsingIcon({ icon: Icon, size = 40, className = "" }: AnimatedIconProps) {
  return (
    <motion.div
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className={`inline-flex items-center justify-center pointer-events-none ${className}`}
      aria-hidden
    >
      <Icon size={size} />
    </motion.div>
  );
}
