"use client";

import { useEffect, useRef, useState } from "react";

// Shared modal shell: bottom sheet on mobile, centered dialog on desktop.
// Enter/exit use interruptible CSS transitions (not keyframes) so rapid
// open/close retargets from the current position, and drag-to-dismiss
// projects release velocity so a quick flick dismisses like a native sheet.
export function BottomSheet({
  open,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; y: number; lastY: number; lastT: number; vy: number } | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF: let the closed state paint first so the enter transition runs.
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    } else {
      setShown(false);
    }
  }, [open]);

  const onTransitionEnd = (e: React.TransitionEvent) => {
    if (!open && e.target === sheetRef.current && (e.propertyName === "transform" || e.propertyName === "opacity")) {
      setMounted(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    drag.current = { startY: y, y: 0, lastY: y, lastT: e.timeStamp, vy: 0 };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d || !sheetRef.current) return;
    const y = e.touches[0].clientY;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vy = (y - d.lastY) / dt;
    d.lastY = y;
    d.lastT = e.timeStamp;
    d.y = Math.max(0, y - d.startY);
    sheetRef.current.style.transform = `translateY(${d.y}px)`;
    sheetRef.current.style.transition = "none";
  };

  const handleTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !sheetRef.current) return;
    // Project momentum forward: a fast flick dismisses even from a short
    // drag, a slow drag needs real distance.
    const projected = d.y + d.vy * 160;
    sheetRef.current.style.transform = "";
    sheetRef.current.style.transition = "";
    if (projected > 120) onClose();
  };

  if (!mounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-350 ease-out ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTransitionEnd={onTransitionEnd}
          className={`bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl transition-[transform,opacity] duration-[420ms] sm:duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
            shown
              ? "translate-y-0 sm:scale-100 opacity-100"
              : "translate-y-full sm:translate-y-0 sm:scale-[0.97] sm:opacity-0"
          } ${className}`}
        >
          <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 sm:hidden mx-auto mt-3 -mb-2" />
          {children}
        </div>
      </div>
    </>
  );
}
