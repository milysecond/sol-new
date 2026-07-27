"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
// SVG segments + CSS transform (Edge-safe). Avoids conic-gradient dual-stop
// bugs and Motion infinite-rotate glitches in Chromium Edge.

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

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Full pie slice from startDeg to endDeg (degrees, 0 = top). */
function slicePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const span = endDeg - startDeg;
  // Full circle needs special handling
  if (span >= 359.99) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = span > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

export function VrfWheel({
  entries,
  winnerIndex,
  spinning,
  durationSec,
  winnerName,
}: {
  entries: string[];
  winnerIndex: number;
  spinning: boolean;
  durationSec: number;
  /** Shown under the pointer after the wheel stops */
  winnerName?: string | null;
}) {
  const reduce = useReducedMotion();
  const n = Math.max(entries.length, 1);
  const showLabels = n <= 16;
  const size = 256;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const showWinner = !spinning && Boolean(winnerName) && winnerIndex >= 0 && winnerIndex < n;

  const segments = useMemo(() => {
    return Array.from({ length: n }, (_, i) => {
      const a0 = (i / n) * 360;
      const a1 = ((i + 1) / n) * 360;
      const mid = (a0 + a1) / 2;
      const labelPos = polar(cx, cy, r * 0.62, mid);
      return {
        i,
        path: slicePath(cx, cy, r, a0, a1),
        color: WHEEL_COLORS[i % WHEEL_COLORS.length],
        mid,
        labelX: labelPos.x,
        labelY: labelPos.y,
      };
    });
  }, [n, cx, cy, r]);

  const segmentAngle = 360 / n;
  // Segment 0 starts at top (0°) and goes clockwise. Pointer is fixed at top.
  // After rotation R, the segment under the pointer is the one whose center is at 0.
  // Center of index i is at (i + 0.5) * segmentAngle. We need R such that
  // (winnerCenter + R) mod 360 === 0  =>  R ≡ -winnerCenter (mod 360).
  const winnerCenterFromStart = winnerIndex * segmentAngle + segmentAngle / 2;
  const extraTurns = Math.max(4, Math.round(durationSec * 2.2));
  const landRotation = 360 * extraTurns + (360 - (winnerCenterFromStart % 360));
  const spinLoop = Math.max(0.45, durationSec * 0.16);
  const settle = Math.max(0.85, durationSec * 0.72);

  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<"idle" | "spin" | "land">("idle");
  const wasSpinning = useRef(false);

  useEffect(() => {
    if (reduce) {
      setPhase("idle");
      setRotation(((360 - winnerCenterFromStart) % 360 + 360) % 360);
      wasSpinning.current = false;
      return;
    }
    if (spinning) {
      wasSpinning.current = true;
      setPhase("spin");
      return;
    }
    if (!wasSpinning.current) return;
    wasSpinning.current = false;
    setPhase("land");
    setRotation((prev) => {
      const base = ((prev % 360) + 360) % 360;
      const targetMod = ((landRotation % 360) + 360) % 360;
      let delta = targetMod - base;
      if (delta < 0) delta += 360;
      const turns = Math.max(3, Math.round(landRotation / 360));
      return prev + delta + turns * 360;
    });
  }, [spinning, landRotation, reduce, winnerCenterFromStart]);

  return (
    <div className="flex flex-col items-center py-4 gap-3 vrf-allow-motion">
      <p className="text-[11px] font-medium text-gray-500 dark:text-white/45 flex items-center gap-1.5">
        <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-violet-400" />
        Winner stops under the purple arrow
      </p>

      <div className="relative w-56 h-56 sm:w-64 sm:h-64">
        <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-10" aria-hidden>
          <svg width="22" height="20" viewBox="0 0 22 20" className="block drop-shadow-md">
            <polygon points="11,18 1,2 21,2" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1" />
          </svg>
        </div>

        <div
          className={`w-full h-full rounded-full border-4 shadow-2xl relative vrf-wheel ${
            showWinner ? "border-amber-400/60" : "border-violet-400/30"
          } ${phase === "spin" && !reduce ? "vrf-wheel-spinning" : ""}`}
          style={
            {
              transformOrigin: "50% 50%",
              willChange: spinning || phase === "land" ? "transform" : "auto",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: reduce || phase !== "spin" ? `rotate(${rotation}deg)` : undefined,
              transition:
                phase === "land" && !reduce
                  ? `transform ${settle}s cubic-bezier(0.12, 0.8, 0.12, 1)`
                  : "none",
              ["--vrf-spin-dur" as string]: `${spinLoop}s`,
            } as CSSProperties
          }
        >
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-full block"
            role="img"
            aria-label="Prize wheel"
          >
            <circle cx={cx} cy={cy} r={r} fill="#1e1b4b" />
            {segments.map((seg) => {
              const isWin = showWinner && seg.i === winnerIndex;
              return (
                <path
                  key={seg.i}
                  d={seg.path}
                  fill={isWin ? "#fbbf24" : seg.color}
                  stroke={isWin ? "#f59e0b" : "rgba(255,255,255,0.12)"}
                  strokeWidth={isWin ? 3 : 1}
                  opacity={showWinner && !isWin ? 0.55 : 1}
                />
              );
            })}
            {showLabels &&
              entries.map((item, i) => {
                const seg = segments[i];
                if (!seg) return null;
                const label = item.length > 10 ? item.slice(0, 9) + "…" : item;
                const isWin = showWinner && i === winnerIndex;
                return (
                  <text
                    key={`t-${i}`}
                    x={seg.labelX}
                    y={seg.labelY}
                    fill={isWin ? "#1c1917" : "white"}
                    fontSize={n > 10 ? 9 : 11}
                    fontWeight={isWin ? 800 : 600}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${seg.mid}, ${seg.labelX}, ${seg.labelY})`}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {label}
                  </text>
                );
              })}
            <circle
              cx={cx}
              cy={cy}
              r={28}
              fill="rgba(0,0,0,0.85)"
              stroke="rgba(196,181,253,0.5)"
              strokeWidth={2}
            />
            <text
              x={cx}
              y={cy}
              fill="#ddd6fe"
              fontSize={11}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              sol
            </text>
          </svg>
        </div>
      </div>

      {spinning ? (
        <p className="text-sm font-medium text-violet-500 animate-pulse">Spinning…</p>
      ) : showWinner ? (
        <p className="text-center px-3">
          <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-white/40 block mb-0.5">
            Arrow points to
          </span>
          <span className="text-lg font-bold text-amber-500 break-all">{winnerName}</span>
        </p>
      ) : (
        <p className="text-xs text-gray-500 dark:text-white/40">
          {n} {n === 1 ? "name" : "names"} on the wheel
        </p>
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
      entries={entries.length ? entries : ["Add", "names", "below", "→"]}
      winnerIndex={Math.max(0, Math.min(winnerIndex, Math.max(entries.length - 1, 0)))}
      spinning={spinning}
      durationSec={durationSec}
      winnerName={winner}
    />
  );
}
