"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Spinner } from "@/components/spinner";

type Props = {
  onConfirm: () => void | Promise<void>;
  label?: string;
  loadingLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Accent: purple (send) or amber (gift) */
  tone?: "purple" | "amber";
  className?: string;
};

const THRESHOLD = 0.88;

/**
 * Slide-to-confirm control. Drag the thumb all the way right to fire onConfirm.
 * Resets if released early. Disabled while loading.
 */
export function SlideToSend({
  onConfirm,
  label = "Slide to send",
  loadingLabel = "Sending…",
  disabled = false,
  loading = false,
  tone = "purple",
  className = "",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [max, setMax] = useState(0);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const confirmed = useRef(false);

  const thumbSize = 48;
  const pad = 4;

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setMax(Math.max(0, el.clientWidth - thumbSize - pad * 2));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!loading && !dragging) {
      setOffset(0);
      confirmed.current = false;
    }
  }, [loading, dragging]);

  const progress = max > 0 ? offset / max : 0;
  const locked = disabled || loading;

  const finish = useCallback(async () => {
    if (confirmed.current || locked) return;
    confirmed.current = true;
    setOffset(max);
    try {
      await onConfirm();
    } finally {
      // parent sets loading; if not, snap back
      if (!loading) {
        setTimeout(() => {
          setOffset(0);
          confirmed.current = false;
        }, 400);
      }
    }
  }, [locked, max, onConfirm, loading]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    startX.current = e.clientX;
    startOffset.current = offset;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || locked) return;
    const dx = e.clientX - startX.current;
    const next = Math.min(max, Math.max(0, startOffset.current + dx));
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (max > 0 && offset / max >= THRESHOLD) {
      void finish();
    } else {
      setOffset(0);
    }
  };

  const fill =
    tone === "amber"
      ? "from-amber-500/30 to-amber-500/50"
      : "from-purple-500/30 to-purple-500/50";
  const thumb =
    tone === "amber"
      ? "bg-amber-500 text-black"
      : "bg-purple-500 text-white";
  const trackBorder =
    tone === "amber" ? "border-amber-400/30" : "border-purple-400/30";

  return (
    <div
      ref={trackRef}
      className={`relative h-14 w-full select-none touch-none overflow-hidden rounded-xl border bg-black/5 dark:bg-white/5 ${trackBorder} ${
        locked ? "opacity-50" : ""
      } ${className}`}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label={label}
      aria-disabled={locked}
    >
      {/* fill */}
      <div
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${fill} transition-[width] ${
          dragging ? "duration-0" : "duration-200"
        }`}
        style={{ width: offset + thumbSize / 2 + pad }}
      />

      {/* label */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold transition-opacity ${
          progress > 0.35 || loading
            ? "opacity-0"
            : "text-gray-600 dark:text-white/60 opacity-100"
        }`}
      >
        {label}
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 dark:text-white/80">
          <Spinner size={16} />
          {loadingLabel}
        </div>
      )}

      {/* thumb */}
      {!loading && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`absolute top-1 flex h-12 w-12 items-center justify-center rounded-lg shadow-md ${thumb} ${
            locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
          } ${dragging ? "duration-0" : "transition-transform duration-200"}`}
          style={{
            transform: `translateX(${pad + offset}px)`,
            touchAction: "none",
          }}
        >
          <ChevronRight size={22} strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}
