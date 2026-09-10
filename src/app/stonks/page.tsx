"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, TrendingUp } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import type { StonkTokenRow } from "@/lib/stonkfun";

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function StonksPage() {
  const [rows, setRows] = useState<StonkTokenRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stonk/tokens");
        const json = (await res.json()) as { ok?: boolean; error?: string; tokens?: StonkTokenRow[] };
        if (!json.ok) throw new Error(json.error || "load failed");
        if (!cancelled) setRows(json.tokens || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load stonks.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <PageTransition>
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-500 mb-2">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Top stonks</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 mt-1">
                  Highest market cap. Full screener on{" "}
                  <a
                    href="https://stonkscreener.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-500 underline inline-flex items-center gap-1"
                  >
                    stonkscreener.com
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </p>
              </div>
              <Link
                href="/stonk"
                className="shrink-0 min-h-12 inline-flex items-center rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-3.5"
              >
                Create
              </Link>
            </div>

            {busy && (
              <p className="text-sm text-gray-400 inline-flex items-center gap-2">
                <Spinner size={16} /> Loading
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}

            {!busy && !error && (
              <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-black/10 dark:border-white/10">
                      <th className="px-3 py-2 font-medium">Stonk</th>
                      <th className="px-3 py-2 font-medium">Pair</th>
                      <th className="px-3 py-2 font-medium text-right">Mcap</th>
                      <th className="px-3 py-2 font-medium text-right">24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.mint} className="border-b border-black/5 dark:border-white/5 last:border-0">
                        <td className="px-3 py-2.5">
                          <a
                            href={`https://stonkscreener.com/token/${r.mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold hover:text-emerald-500"
                          >
                            {r.symbol}
                          </a>
                          <p className="text-xs text-gray-400 truncate max-w-[10rem]">{r.name}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{r.quoteSymbol || "-"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtUsd(r.mcap)}</td>
                        <td
                          className={`px-3 py-2.5 text-right font-mono text-xs ${
                            (r.change24h || 0) > 0
                              ? "text-emerald-500"
                              : (r.change24h || 0) < 0
                                ? "text-red-400"
                                : "text-gray-400"
                          }`}
                        >
                          {fmtPct(r.change24h)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-400">
              Charts, holders, and buy live on{" "}
              <a href="https://stonkscreener.com" className="underline text-emerald-500" target="_blank" rel="noopener noreferrer">
                stonkscreener.com
              </a>
              . Launch a new one on{" "}
              <Link href="/stonk" className="underline text-emerald-500">
                /stonk
              </Link>
              .
            </p>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
