"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { RING_BETA_NOTE, RING_KEYS_NOTE, RING_PRIVACY_POINTS } from "@/lib/ring/copy";
import { RING_ASSETS, type RingAssetId } from "@/lib/ring/constants";
import type { KeyProgressInfo } from "@/lib/ring/session";

export const RING_FIELD =
  "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/25 transition disabled:opacity-50";

export const RING_PRIMARY =
  "w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";

export const RING_WARN_BUTTON =
  "w-full bg-amber-500 hover:bg-amber-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 text-white font-semibold rounded-xl px-4 py-3.5 transition inline-flex items-center justify-center gap-2";

export function RingBetaBanner() {
  return (
    <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 leading-relaxed">
      <span className="font-semibold">Beta · mainnet.</span> {RING_BETA_NOTE.replace(/^Beta on Solana mainnet\. /, "")}
    </p>
  );
}

export function RingPrivacyCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-500" /> What stays private
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs text-gray-600 dark:text-white/55 leading-relaxed">
          <ul className="list-disc pl-4 space-y-1">
            {RING_PRIVACY_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p>{RING_KEYS_NOTE}</p>
          <p className="text-gray-400 dark:text-white/35">
            Runs on the permissionless Default Ring of Helius Privacy Rings. Not the Privacy Cash send on your wallet —
            that&apos;s a different protocol.
          </p>
        </div>
      )}
    </div>
  );
}

export function AssetToggle({
  value,
  onChange,
  disabled,
}: {
  value: RingAssetId;
  onChange: (v: RingAssetId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(RING_ASSETS) as RingAssetId[]).map((id) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(id)}
          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
            value === id
              ? "border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70"
          }`}
        >
          {RING_ASSETS[id].symbol}
        </button>
      ))}
    </div>
  );
}

export function VisibilityNote({ kind, children }: { kind: "private" | "public"; children: React.ReactNode }) {
  return (
    <p
      className={`text-[11px] leading-relaxed rounded-lg px-2.5 py-1.5 ${
        kind === "private"
          ? "text-emerald-800 dark:text-emerald-200/90 bg-emerald-500/10"
          : "text-amber-800 dark:text-amber-200/90 bg-amber-500/10"
      }`}
    >
      {children}
    </p>
  );
}

function fmtMb(n: number) {
  return `${(n / 1_000_000).toFixed(n > 100_000_000 ? 0 : 1)} MB`;
}

export function KeyProgressBar({ progress }: { progress: KeyProgressInfo | null }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-gray-500 dark:text-white/40">
        {progress.stage === "download"
          ? `Downloading proving key once (${fmtMb(progress.loaded)} of ${fmtMb(progress.total)}). It's cached after this.`
          : "Preparing the proving key on this device…"}
      </p>
    </div>
  );
}
