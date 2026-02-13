"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

interface AnimatedIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

export function AnimatedIcon({ icon: Icon, size = 40, className = "" }: AnimatedIconProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.2, rotate: 5 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className={`inline-flex items-center justify-center ${className}`}
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
      className={`inline-flex items-center justify-center ${className}`}
    >
      <Icon size={size} />
    </motion.div>
  );
}
