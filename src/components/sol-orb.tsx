"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme-context";

export type SolOrbState =
  | "working"
  | "searching"
  | "listening"
  | "breathing"
  | "idle"
  | "composing"
  | "solving"
  | "connecting"
  | "weaving"
  | "shaping";

function normalizeState(state: SolOrbState): Exclude<
  SolOrbState,
  "composing" | "solving" | "connecting" | "weaving" | "shaping"
> {
  if (state === "composing" || state === "solving" || state === "shaping") return "working";
  if (state === "connecting" || state === "weaving") return "searching";
  return state;
}

type SolOrbProps = {
  size?: number;
  state?: SolOrbState;
  className?: string;
  label?: string;
  /** Force colors (skip theme) */
  dark?: boolean;
};

type Dot = {
  orbit: number;
  angle: number;
  speed: number;
  r: number;
  phase: number;
  ghost: boolean;
};

/**
 * sol.new brand orb — own particle orbits (inspired by thinking-logos, not a dependency).
 * Purple core + orbiting dots. Native colors (no mono filter).
 */
export function SolOrb({
  size = 32,
  state = "working",
  className = "",
  label = "sol.new",
  dark: darkProp,
}: SolOrbProps) {
  const { theme } = useTheme();
  const isDark = darkProp ?? theme === "dark";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const rafRef = useRef(0);
  const t0 = useRef(performance.now());
  const motion = normalizeState(state);

  useEffect(() => {
    const orbitN = motion === "breathing" || motion === "idle" ? 6 : motion === "searching" ? 14 : 10;
    const ghostN = motion === "working" ? 28 : 16;
    const dots: Dot[] = [];
    for (let i = 0; i < orbitN; i++) {
      const orbit = 0.28 + (i / Math.max(1, orbitN - 1)) * 0.55;
      dots.push({
        orbit,
        angle: (i / orbitN) * Math.PI * 2 + Math.random() * 0.4,
        speed: (0.4 + orbit * 0.9) * (i % 2 === 0 ? 1 : -1),
        r: 1.1 + (1 - orbit) * 1.4,
        phase: Math.random() * Math.PI * 2,
        ghost: false,
      });
    }
    for (let i = 0; i < ghostN; i++) {
      dots.push({
        orbit: 0.35 + Math.random() * 0.5,
        angle: Math.random() * Math.PI * 2,
        speed: (0.15 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1),
        r: 0.5 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        ghost: true,
      });
    }
    dotsRef.current = dots;
  }, [motion, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const core = isDark ? "#c084fc" : "#7c3aed";
    const mid = isDark ? "#a855f7" : "#9333ea";
    const dim = isDark ? "rgba(192,132,252,0.35)" : "rgba(124,58,237,0.3)";
    const bgGlow = isDark ? "rgba(168,85,247,0.18)" : "rgba(147,51,234,0.12)";

    let alive = true;
    const speedMul =
      motion === "working"
        ? 1.15
        : motion === "searching"
          ? 1.6
          : motion === "listening"
            ? 0.55
            : 0.35;

    const frame = (now: number) => {
      if (!alive) return;
      const t = (now - t0.current) / 1000;
      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.42;

      ctx.clearRect(0, 0, size, size);

      // soft halo
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35);
      g.addColorStop(0, bgGlow);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // core pulse
      const pulse =
        motion === "breathing" || motion === "idle"
          ? 0.85 + 0.15 * Math.sin(t * 2.2)
          : 0.92 + 0.08 * Math.sin(t * 4.5);
      const coreR = R * 0.22 * pulse;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      cg.addColorStop(0, core);
      cg.addColorStop(0.45, mid);
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // faint orbital rings
      ctx.strokeStyle = dim;
      ctx.lineWidth = Math.max(0.5, size * 0.015);
      for (let i = 0; i < 3; i++) {
        const rr = R * (0.4 + i * 0.22);
        ctx.globalAlpha = 0.25 - i * 0.05;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * (0.88 + i * 0.04), t * 0.15 * (i % 2 ? -1 : 1), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // dots
      for (const d of dotsRef.current) {
        d.angle += d.speed * speedMul * 0.018;
        const wobble = motion === "listening" ? Math.sin(t * 3 + d.phase) * 0.04 : 0;
        const tilt = 0.55 + 0.2 * Math.sin(d.phase);
        const ox = Math.cos(d.angle) * d.orbit * R;
        const oy = Math.sin(d.angle) * d.orbit * R * tilt + wobble * R;
        const x = cx + ox;
        const y = cy + oy;
        const depth = 0.55 + 0.45 * ((Math.sin(d.angle + d.phase) + 1) / 2);
        const pr = d.r * (size / 32) * (0.7 + depth * 0.5);
        ctx.globalAlpha = d.ghost ? 0.25 * depth : 0.55 + 0.45 * depth;
        ctx.fillStyle = d.ghost ? mid : core;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, pr), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [size, motion, isDark]);

  return (
    <canvas
      ref={canvasRef}
      className={`block ${className}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
    />
  );
}

/** Static SVG mark for favicons / when canvas is overkill */
export function SolOrbMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id="solOrbCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="40%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#solOrbCore)" opacity="0.25" />
      <ellipse
        cx="32"
        cy="32"
        rx="22"
        ry="10"
        fill="none"
        stroke="#a855f7"
        strokeWidth="1.5"
        opacity="0.55"
        transform="rotate(-18 32 32)"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="18"
        ry="8"
        fill="none"
        stroke="#c084fc"
        strokeWidth="1.2"
        opacity="0.45"
        transform="rotate(32 32 32)"
      />
      <circle cx="32" cy="32" r="7" fill="url(#solOrbCore)" />
      <circle cx="48" cy="28" r="2.2" fill="#e9d5ff" />
      <circle cx="20" cy="40" r="1.6" fill="#c084fc" />
      <circle cx="38" cy="48" r="1.4" fill="#a855f7" />
    </svg>
  );
}
