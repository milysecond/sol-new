"use client";

import { useEffect, useRef, useState } from "react";

interface Stats {
  wallets: number;
  tokens: number;
  nfts: number;
}

function useCountUp(target: number | null, durationMs = 1200): number | null {
  const [value, setValue] = useState<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    const from = value ?? 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

/**
 * Slim social-proof strip showing how many unique users (passkey wallets)
 * have been created, plus tokens and NFTs. Renders nothing until stats load,
 * and stays hidden if the stats API is unavailable.
 */
export function StatsBar({ className = "" }: { className?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then((j) => {
        if (j && typeof j.wallets === "number") setStats(j);
      })
      .catch(() => {});
  }, []);

  const wallets = useCountUp(stats?.wallets ?? null);
  if (stats == null || wallets == null) return null;

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div
      className={`flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-white/40 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
      </span>
      <span>
        <span className="font-semibold text-gray-700 dark:text-white/70 font-mono">{fmt(wallets)}</span> people have
        created wallets
      </span>
      <span className="text-gray-300 dark:text-white/15">·</span>
      <span>
        <span className="font-semibold text-gray-700 dark:text-white/70 font-mono">{fmt(stats.tokens)}</span> tokens
      </span>
      <span className="text-gray-300 dark:text-white/15 hidden sm:inline">·</span>
      <span className="hidden sm:inline">
        <span className="font-semibold text-gray-700 dark:text-white/70 font-mono">{fmt(stats.nfts)}</span> NFTs
      </span>
    </div>
  );
}
