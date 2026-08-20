"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, RefreshCw, Copy, Check } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageShell } from "@/components/page-shell";
import { Spinner } from "@/components/spinner";
import { toast } from "@/lib/toast";

type Pack = {
  space: number;
  lamports: number;
  sol: number;
  usd: number | null;
};

type RentPayload = {
  ok?: boolean;
  error?: string;
  price?: number;
  rentLamports?: number;
  rentInSol?: number;
  rentInUsd?: number | null;
  tokenAccount?: Pack;
  systemAccount?: Pack;
  custom?: Pack;
  note?: string;
  updatedAt?: string;
};

function fmtLamports(n: number) {
  return n.toLocaleString("en-US");
}

function fmtSol(n: number) {
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function Row({
  label,
  sub,
  lamports,
  sol,
  usd,
  accent,
}: {
  label: string;
  sub?: string;
  lamports: number;
  sol: number;
  usd: number | null | undefined;
  accent?: "violet" | "emerald" | "rose";
}) {
  const solCls =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : "text-violet-600 dark:text-violet-400";

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {label}
          </p>
          {sub && (
            <p className="text-[11px] text-gray-500 dark:text-white/40">{sub}</p>
          )}
        </div>
        <p className={`text-xl font-bold tabular-nums shrink-0 ${solCls}`}>
          {fmtUsd(usd)}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-gray-800 dark:text-white/85 tabular-nums">
          {fmtLamports(lamports)}{" "}
          <span className="text-gray-400 text-xs">lamports</span>
        </span>
        <span className={`font-mono font-semibold tabular-nums ${solCls}`}>
          {fmtSol(sol)} SOL
        </span>
      </div>
    </div>
  );
}

export default function RentPage() {
  const [data, setData] = useState<RentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (customSpace?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        customSpace && /^\d+$/.test(customSpace.trim())
          ? `?space=${encodeURIComponent(customSpace.trim())}`
          : "";
      const r = await fetch(`/api/rent${qs}`, { cache: "no-store" });
      const j = (await r.json()) as RentPayload;
      if (!r.ok || j.ok === false) {
        throw new Error(j.error || "Failed to load rent");
      }
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const token = data?.tokenAccount;
  const system = data?.systemAccount;
  const primaryLamports = token?.lamports ?? data?.rentLamports ?? 0;

  const copyLamports = async () => {
    try {
      await navigator.clipboard.writeText(String(primaryLamports));
      setCopied(true);
      toast.success("Lamports copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <PageShell max="md" innerClassName="space-y-5 py-8 sm:py-12">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/15 text-violet-500 mx-auto">
            <Coins className="w-6 h-6" />
          </div>
          <p className="text-[11px] uppercase tracking-wider text-violet-500 font-semibold">
            Rent
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            SOLANA Minimum Rent
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/45 italic">
            Live from Solana RPC · sol.new/rent
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">Account opening cost</p>
            <button
              type="button"
              onClick={() => void load(space)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 min-h-[36px] px-2"
            >
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Spinner size={18} /> Loading rent…
            </div>
          )}

          {data && token && (
            <div className="space-y-3">
              <Row
                label="Token account"
                sub={`${token.space} bytes · SPL ATA (same as minrent)`}
                lamports={token.lamports}
                sol={token.sol}
                usd={token.usd}
                accent="emerald"
              />
              {system && (
                <Row
                  label="System account"
                  sub={`${system.space} bytes · empty account`}
                  lamports={system.lamports}
                  sol={system.sol}
                  usd={system.usd}
                  accent="rose"
                />
              )}

              <div className="flex justify-between items-center gap-3 pt-1 border-t border-black/5 dark:border-white/10">
                <span className="text-sm font-medium text-gray-600 dark:text-white/60">
                  SOL price
                </span>
                <span className="text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                  {data.price ? `$${data.price.toFixed(2)}` : "—"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void copyLamports()}
                className="w-full min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                {copied ? (
                  <Check size={16} className="text-emerald-500" />
                ) : (
                  <Copy size={16} />
                )}
                Copy token rent lamports
              </button>

              <p className="text-[11px] text-gray-500 dark:text-white/40 text-center leading-relaxed">
                {data.note ||
                  "Minimum rent is refunded in full when you close the account."}
              </p>
            </div>
          )}
        </div>

        <details className="rounded-2xl border border-black/10 dark:border-white/10 px-4 py-3">
          <summary className="text-sm font-medium cursor-pointer list-none flex items-center justify-between">
            <span>Custom account size</span>
            <span className="text-xs text-gray-400">bytes</span>
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min={0}
              max={10000000}
              inputMode="numeric"
              placeholder="e.g. 165"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="flex-1 min-h-[44px] rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => void load(space)}
              disabled={loading || !space.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold"
            >
              Calc
            </button>
          </div>
          {data?.custom && (
            <div className="mt-3">
              <Row
                label={`Custom (${data.custom.space} bytes)`}
                lamports={data.custom.lamports}
                sol={data.custom.sol}
                usd={data.custom.usd}
              />
            </div>
          )}
        </details>

        <p className="text-center text-[11px] text-gray-400">
          Inspired by{" "}
          <a
            href="https://minrent.sal.fun"
            className="text-violet-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            minrent.sal.fun
          </a>
        </p>
      </PageShell>
    </div>
  );
}
