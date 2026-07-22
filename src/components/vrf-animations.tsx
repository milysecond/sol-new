"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const LAND_EASE = [0.12, 0.8, 0.12, 1] as const;

// ── Coin flip ────────────────────────────────────────────────────────────────

export function VrfCoinFlip({
  spinning,
  result,
  durationSec,
}: {
  spinning: boolean;
  result: "Heads" | "Tails" | string | null;
  /** Total animation budget in seconds (spin + settle). */
  durationSec: number;
}) {
  const reduce = useReducedMotion();
  const isHeads = !result || result === "Heads";
  const endRot = isHeads ? 1800 : 1980;
  const spinLoop = Math.max(0.35, durationSec * 0.22);
  const settle = Math.max(0.5, durationSec * 0.55);

  return (
    <div className="flex justify-center py-6" style={{ perspective: 900 }}>
      <motion.div
        className="relative w-28 h-28"
        style={{ transformStyle: "preserve-3d" }}
        animate={
          reduce
            ? { rotateY: isHeads ? 0 : 180 }
            : spinning
              ? { rotateY: [0, 720, 1440, 2160] }
              : { rotateY: endRot }
        }
        transition={
          spinning
            ? { duration: spinLoop, ease: "linear", repeat: Infinity }
            : { duration: settle, ease: EASE_OUT }
        }
      >
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center shadow-xl border-4 border-violet-300/40"
          style={{
            backfaceVisibility: "hidden",
            background:
              "radial-gradient(circle at 35% 30%, #e9d5ff 0%, #a78bfa 40%, #7c3aed 100%)",
          }}
        >
          <span className="text-3xl font-black text-white drop-shadow">H</span>
        </div>
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center shadow-xl border-4 border-fuchsia-300/40"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "radial-gradient(circle at 35% 30%, #f5d0fe 0%, #e879f9 40%, #c026d3 100%)",
          }}
        >
          <span className="text-3xl font-black text-white drop-shadow">T</span>
        </div>
      </motion.div>
    </div>
  );
}

// ── Dice ─────────────────────────────────────────────────────────────────────

const PIP_MAP: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 28],
    [72, 28],
    [28, 50],
    [72, 50],
    [28, 72],
    [72, 72],
  ],
};

function DieFace({ n }: { n: number }) {
  const pips = PIP_MAP[n] || PIP_MAP[1];
  return (
    <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-fuchsia-600 shadow-xl border border-white/20">
      {pips.map(([x, y], i) => (
        <span
          key={i}
          className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-sm"
          style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
        />
      ))}
    </div>
  );
}

export function VrfDice({
  spinning,
  result,
  durationSec,
}: {
  spinning: boolean;
  result: string | number | null;
  durationSec: number;
}) {
  const reduce = useReducedMotion();
  const face = Math.min(6, Math.max(1, Number(result) || 1));
  const [flash, setFlash] = useState(1);
  const flashMs = Math.max(50, Math.min(140, Math.round((durationSec * 1000) / 24)));

  useEffect(() => {
    if (!spinning) return;
    const t = setInterval(() => setFlash((f) => (f % 6) + 1), flashMs);
    return () => clearInterval(t);
  }, [spinning, flashMs]);

  const show = spinning ? flash : face;
  const tumble = Math.max(0.28, durationSec * 0.12);

  return (
    <div className="flex justify-center py-6">
      <motion.div
        className="w-24 h-24"
        animate={
          reduce
            ? {}
            : spinning
              ? { rotate: [0, 25, -20, 30, -15, 0], scale: [1, 1.05, 0.95, 1.08, 1] }
              : { rotate: 0, scale: 1 }
        }
        transition={
          spinning
            ? { duration: tumble, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", duration: Math.min(0.9, durationSec * 0.25), bounce: 0.35 }
        }
      >
        <DieFace n={show} />
      </motion.div>
    </div>
  );
}

// ── Wheel ────────────────────────────────────────────────────────────────────

const WHEEL_COLORS = [
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#c026d3",
  "#7c3aed",
  "#6366f1",
  "#ec4899",
  "#9333ea",
];

export function VrfWheel({
  entries,
  winnerIndex,
  spinning,
  durationSec,
}: {
  entries: string[];
  winnerIndex: number;
  spinning: boolean;
  durationSec: number;
}) {
  const reduce = useReducedMotion();
  const n = Math.max(entries.length, 1);
  const showLabels = n <= 16;
  const conic = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 360;
      const a1 = ((i + 1) / n) * 360;
      parts.push(`${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${a0}deg ${a1}deg`);
    }
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }, [n]);

  const segmentAngle = 360 / n;
  const winnerCenterFromStart = winnerIndex * segmentAngle + segmentAngle / 2;
  // More turns for longer durations
  const extraTurns = Math.max(4, Math.round(durationSec * 2.2));
  const landRotation = 360 * extraTurns + (360 - winnerCenterFromStart);
  const spinLoop = Math.max(0.5, durationSec * 0.18);
  const settle = Math.max(0.8, durationSec * 0.72);

  return (
    <div className="flex flex-col items-center py-4 gap-2">
      <div className="relative w-56 h-56 sm:w-64 sm:h-64">
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-1 z-10 w-0 h-0"
          style={{
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: "18px solid #a78bfa",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        />
        <motion.div
          className="w-full h-full rounded-full border-4 border-violet-400/30 shadow-2xl relative overflow-hidden"
          style={{ background: conic }}
          animate={
            reduce
              ? { rotate: landRotation % 360 }
              : spinning
                ? { rotate: 360 * 8 }
                : { rotate: landRotation }
          }
          transition={
            spinning
              ? { duration: spinLoop, ease: "linear", repeat: Infinity }
              : { duration: settle, ease: LAND_EASE }
          }
        >
          {showLabels &&
            entries.map((item, i) => {
              const mid = ((i + 0.5) / n) * 360 - 90;
              const rad = (mid * Math.PI) / 180;
              const r = 38;
              const x = 50 + r * Math.cos(rad);
              const y = 50 + r * Math.sin(rad);
              const label = item.length > 10 ? item.slice(0, 9) + "…" : item;
              return (
                <span
                  key={i}
                  className="absolute text-[9px] sm:text-[10px] font-semibold text-white/95 drop-shadow pointer-events-none max-w-[4.5rem] truncate text-center"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(-50%, -50%) rotate(${mid + 90}deg)`,
                  }}
                >
                  {label}
                </span>
              );
            })}
          <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/80 border-2 border-violet-300/50 flex items-center justify-center">
            <span className="text-[10px] font-bold text-violet-200">sol</span>
          </div>
        </motion.div>
      </div>
      {n > 16 && (
        <p className="text-[11px] text-gray-500 dark:text-white/40">{n} entries</p>
      )}
    </div>
  );
}

export function VrfStage({
  mode,
  spinning,
  winner,
  winnerIndex,
  entries,
  durationSec,
}: {
  mode: "list" | "range" | "coin" | "dice";
  spinning: boolean;
  winner: string | null;
  winnerIndex: number;
  entries: string[];
  durationSec: number;
}) {
  if (mode === "coin") {
    return (
      <VrfCoinFlip
        spinning={spinning}
        result={winner as "Heads" | "Tails" | null}
        durationSec={durationSec}
      />
    );
  }
  if (mode === "dice") {
    return (
      <VrfDice spinning={spinning} result={winner} durationSec={durationSec} />
    );
  }
  return (
    <VrfWheel
      entries={entries.length ? entries : ["?", "?", "?", "?"]}
      winnerIndex={Math.max(0, winnerIndex)}
      spinning={spinning}
      durationSec={durationSec}
    />
  );
}
