"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Search,
  ExternalLink,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { ImageWithPlaceholder } from "@/components/image-with-placeholder";

type StockRow = {
  mint: string;
  symbol: string;
  name: string;
  provider: string;
  sector: string;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  stockPrice: number | null;
  mcap: number | null;
  premiumPct: number | null;
  jupUrl: string;
  solscanUrl: string;
};

type SortKey = "volume" | "change" | "premium" | "liquidity" | "mcap" | "name" | "price";

function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(digits)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function pctColor(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "text-gray-400";
  if (n > 0.05) return "text-emerald-500";
  if (n < -0.05) return "text-red-400";
  return "text-gray-500 dark:text-white/50";
}

const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: "volume", label: "Volume 24h" },
  { key: "change", label: "Change 24h" },
  { key: "premium", label: "Premium" },
  { key: "liquidity", label: "Liquidity" },
  { key: "mcap", label: "Mcap" },
  { key: "price", label: "Price" },
  { key: "name", label: "Name" },
];

export default function StocksPage() {
  const [items, setItems] = useState<StockRow[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [provider, setProvider] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<SortKey>("volume");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({
        sort,
        dir,
        limit: "300",
      });
      if (qDebounced) p.set("q", qDebounced);
      if (provider) p.set("provider", provider);
      if (sector) p.set("sector", sector);
      const res = await fetch(`/api/stocks?${p}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        items?: StockRow[];
        total?: number;
        providers?: string[];
        sectors?: string[];
        updatedAt?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load stocks");
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setProviders(data.providers || []);
      setSectors(data.sectors || []);
      setUpdatedAt(data.updatedAt || null);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [qDebounced, provider, sector, sort, dir]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const withVol = items.filter((i) => i.volume24h != null);
    const vol = withVol.reduce((s, i) => s + (i.volume24h || 0), 0);
    const avgPrem =
      items.filter((i) => i.premiumPct != null).reduce((s, i) => s + (i.premiumPct || 0), 0) /
      Math.max(1, items.filter((i) => i.premiumPct != null).length);
    return { vol, avgPrem, count: total };
  }, [items, total]);

  const selectCls =
    "px-2.5 py-1.5 rounded-lg text-xs sm:text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 cursor-pointer";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <PageTransition>
          <div className="w-full sm:max-w-5xl space-y-6">
            <header className="text-center space-y-2">
              <div className="flex justify-center">
                <LineChart className="text-blue-400" size={36} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Stocks</h1>
              <p className="text-sm text-gray-500 dark:text-white/50 max-w-lg mx-auto">
                Tokenized equities on Solana. Prices, liquidity, and premium versus the traditional
                market price.
              </p>
            </header>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Listed</p>
                <p className="text-lg font-semibold tabular-nums">{summary.count || "—"}</p>
              </div>
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Vol 24h</p>
                <p className="text-lg font-semibold tabular-nums">{fmtUsd(summary.vol, 1)}</p>
              </div>
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Avg premium</p>
                <p className={`text-lg font-semibold tabular-nums ${pctColor(summary.avgPrem)}`}>
                  {fmtPct(summary.avgPrem)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-center">
              <div className="relative flex-1 min-w-[160px] max-w-sm">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, ticker, mint"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:outline-none focus:border-blue-400/50"
                />
              </div>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={selectCls}
              >
                <option value="">All providers</option>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className={selectCls}
              >
                <option value="">All sectors</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className={selectCls}
              >
                {SORT_OPTS.map((o) => (
                  <option key={o.key} value={o.key}>
                    Sort: {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
                className={`${selectCls} inline-flex items-center gap-1`}
                title="Toggle sort direction"
              >
                <ArrowUpDown size={14} />
                {dir === "desc" ? "High first" : "Low first"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className={`${selectCls} inline-flex items-center gap-1 disabled:opacity-40`}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="flex justify-center py-20">
                <Spinner size={28} />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-gray-400 py-16 text-sm">No stocks match these filters.</p>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="md:hidden space-y-2">
                  {items.map((s) => (
                    <li
                      key={s.mint}
                      className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.02] p-3"
                    >
                      <div className="flex items-start gap-3">
                        <ImageWithPlaceholder
                          src={`https://xstocks-metadata.backed.fi/logos/tokens/${s.symbol}.png`}
                          alt=""
                          className="w-10 h-10 rounded-xl shrink-0"
                          fallback={
                            <span className="text-[10px] font-bold text-blue-400">
                              {s.symbol.slice(0, 3)}
                            </span>
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-semibold truncate">{s.name}</span>
                            <span className="text-xs font-mono text-gray-500 dark:text-white/40">
                              {s.symbol}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                            <span>{s.provider}</span>
                            {s.sector && <span>· {s.sector}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm tabular-nums">
                            <span className="font-medium">{fmtUsd(s.price)}</span>
                            <span className={pctColor(s.change24h)}>{fmtPct(s.change24h)}</span>
                            <span className={pctColor(s.premiumPct)} title="vs traditional price">
                              prem {fmtPct(s.premiumPct)}
                            </span>
                          </div>
                          <div className="flex gap-3 mt-2 text-xs">
                            <a
                              href={s.jupUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                            >
                              Trade <ExternalLink size={10} />
                            </a>
                            <a
                              href={s.solscanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:underline"
                            >
                              Solscan
                            </a>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden md:block rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_72px_88px_80px_88px_88px_72px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-400 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/5 dark:border-white/5">
                    <span>Asset</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">24h</span>
                    <span className="text-right">Premium</span>
                    <span className="text-right">Vol 24h</span>
                    <span className="text-right">Liquidity</span>
                    <span className="text-right">Trade</span>
                  </div>
                  <ul className="divide-y divide-black/5 dark:divide-white/5 max-h-[70vh] overflow-y-auto">
                    {items.map((s) => (
                      <li
                        key={s.mint}
                        className="grid grid-cols-[minmax(0,1.4fr)_72px_88px_80px_88px_88px_72px] gap-2 items-center px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] min-h-[52px]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ImageWithPlaceholder
                            src={`https://xstocks-metadata.backed.fi/logos/tokens/${s.symbol}.png`}
                            alt=""
                            className="w-8 h-8 rounded-lg shrink-0"
                            fallback={
                              <span className="text-[9px] font-bold text-blue-400">
                                {s.symbol.slice(0, 2)}
                              </span>
                            }
                          />
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-semibold text-sm truncate">{s.name}</span>
                              <span className="text-xs font-mono text-gray-500 dark:text-white/40 shrink-0">
                                {s.symbol}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">
                              {s.provider}
                              {s.sector ? ` · ${s.sector}` : ""}
                            </div>
                          </div>
                        </div>
                        <span className="text-right text-sm tabular-nums font-medium">
                          {fmtUsd(s.price)}
                        </span>
                        <span className={`text-right text-sm tabular-nums ${pctColor(s.change24h)}`}>
                          {fmtPct(s.change24h)}
                        </span>
                        <span
                          className={`text-right text-sm tabular-nums ${pctColor(s.premiumPct)}`}
                          title={
                            s.stockPrice != null
                              ? `Traditional: ${fmtUsd(s.stockPrice)}`
                              : undefined
                          }
                        >
                          {fmtPct(s.premiumPct)}
                        </span>
                        <span className="text-right text-sm tabular-nums text-gray-600 dark:text-white/70">
                          {fmtUsd(s.volume24h, 1)}
                        </span>
                        <span className="text-right text-sm tabular-nums text-gray-600 dark:text-white/70">
                          {fmtUsd(s.liquidity, 1)}
                        </span>
                        <div className="flex justify-end">
                          <a
                            href={s.jupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            Jupiter <ExternalLink size={10} />
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-center text-gray-400 dark:text-white/30">
                  Showing {items.length}
                  {total > items.length ? ` of ${total}` : ""} · Premium is on-chain vs traditional
                  quote
                  {updatedAt
                    ? ` · Updated ${new Date(updatedAt).toLocaleTimeString()}`
                    : ""}
                </p>
              </>
            )}

            <p className="text-[11px] text-center text-gray-400 dark:text-white/30 pb-4">
              Market data for screening only. Not financial advice.{" "}
              <Link href="/token" className="text-blue-400 hover:underline">
                Launch a token
              </Link>
            </p>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
