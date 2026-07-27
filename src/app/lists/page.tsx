"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Star,
  Plus,
  Trash2,
  Pencil,
  ArrowUpDown,
  Search,
  ExternalLink,
  List,
  RefreshCw,
  Check,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { ImageWithPlaceholder } from "@/components/image-with-placeholder";
import { useWallet } from "@/lib/wallet-context";
import {
  loadLists,
  saveLists,
  createList,
  renameList,
  deleteList,
  removeFromList,
  addToList,
  sortItems,
  type Watchlist,
  type ListItem,
  type SortKey,
  type SortDir,
  type TokenQuote,
} from "@/lib/lists";

type SearchHit = {
  mint: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  marketCapUsd: number | null;
  priceUsd: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  verified: boolean;
};

function formatMcap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatChange(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function shortMint(m: string) {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "mc", label: "Market cap", defaultDir: "desc" },
  { key: "change", label: "24h change", defaultDir: "desc" },
  { key: "added", label: "Recently added", defaultDir: "desc" },
  { key: "name", label: "Name", defaultDir: "asc" },
];

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Never throw on HTML/text 500 bodies like "Internal Server Error". */
async function readQuotesResponse(res: Response): Promise<{
  quotes: Record<string, TokenQuote>;
  errors: string[];
  warnings: string[];
  httpError?: string;
}> {
  const text = await res.text();
  if (!text) {
    return {
      quotes: {},
      errors: [],
      warnings: [],
      httpError: res.ok ? undefined : `Quotes failed (${res.status})`,
    };
  }
  try {
    const data = JSON.parse(text) as {
      quotes?: Record<string, TokenQuote>;
      errors?: string[];
      warnings?: string[];
      error?: string;
    };
    return {
      quotes: data.quotes ?? {},
      errors: [
        ...(Array.isArray(data.errors) ? data.errors : []),
        ...(data.error ? [data.error] : []),
      ],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      httpError: res.ok ? undefined : data.error || `Quotes failed (${res.status})`,
    };
  } catch {
    // Cloudflare/workerd sometimes returns plain text "Internal Server Error"
    const snippet = text.replace(/\s+/g, " ").slice(0, 80);
    return {
      quotes: {},
      errors: [],
      warnings: [],
      httpError: res.ok
        ? `Invalid response from quotes API`
        : `Quotes unavailable (${res.status}${snippet ? `: ${snippet}` : ""})`,
    };
  }
}

export default function ListsPage() {
  const { publicKey } = useWallet();
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string>("favorites");
  const [sort, setSort] = useState<SortKey>("mc");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [quotes, setQuotes] = useState<Record<string, TokenQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quotesWarn, setQuotesWarn] = useState<string | null>(null);
  const [addMint, setAddMint] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addWarn, setAddWarn] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);

  const refresh = useCallback(() => {
    const next = loadLists(publicKey);
    setLists(next);
    setActiveId((id) => (next.some((l) => l.id === id) ? id : next[0]?.id ?? "favorites"));
  }, [publicKey]);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onChange = () => refresh();
    window.addEventListener("sol.new.lists", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sol.new.lists", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const active = useMemo(
    () => lists.find((l) => l.id === activeId) ?? lists[0] ?? null,
    [lists, activeId],
  );

  const mintsKey = active?.items.map((i) => i.mint).join(",") ?? "";

  const fetchQuotes = useCallback(async (mints: string[]) => {
    if (mints.length === 0) {
      setQuotes({});
      setQuotesError(null);
      setQuotesWarn(null);
      return;
    }
    setQuotesLoading(true);
    setQuotesError(null);
    setQuotesWarn(null);
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
      const merged: Record<string, TokenQuote> = {};
      const batchErrors: string[] = [];
      const batchWarnings: string[] = [];
      let anyOk = false;

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const res = await fetch(`/api/lists/quotes?mints=${chunk.join(",")}`, {
              cache: "no-store",
            });
            const data = await readQuotesResponse(res);
            if (Object.keys(data.quotes).length > 0) {
              Object.assign(merged, data.quotes);
              anyOk = true;
            }
            // Hard errors only (Jupiter etc.) — skip per-mint rugcheck 429 noise
            for (const err of data.errors) {
              if (/rugcheck/i.test(err) && /429/.test(err)) continue;
              batchErrors.push(err);
            }
            batchWarnings.push(...data.warnings);
            if (data.httpError && !anyOk) batchErrors.push(data.httpError);
          } catch (e) {
            batchErrors.push(
              e instanceof Error ? e.message : "Network error fetching quotes",
            );
          }
        }),
      );

      if (Object.keys(merged).length > 0) {
        setQuotes((prev) => ({ ...prev, ...merged }));
      }
      if (!anyOk) {
        setQuotesError(
          batchErrors[0]
            ? `Couldn’t load prices: ${batchErrors[0]}`
            : "Couldn’t load prices from Jupiter / RugCheck",
        );
        setQuotesWarn(null);
      } else {
        setQuotesError(null);
        // Soft: risk-only issues
        const soft =
          batchWarnings[0] ||
          (batchErrors.some((e) => /rugcheck/i.test(e))
            ? "Risk scores delayed — prices are live."
            : null);
        setQuotesWarn(soft);
      }
    } catch (e) {
      setQuotesError(e instanceof Error ? e.message : "Failed to load quotes");
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !active) return;
    fetchQuotes(active.items.map((i) => i.mint));
  }, [hydrated, mintsKey, active, fetchQuotes]);

  const sortedItems = useMemo(() => {
    if (!active) return [];
    let items = sortItems(active.items, quotes, sort, sortDir);
    const f = listFilter.trim().toLowerCase();
    if (f) {
      items = items.filter((it) => {
        const q = quotes[it.mint];
        const hay = [
          it.mint,
          it.name,
          it.symbol,
          q?.name,
          q?.symbol,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(f);
      });
    }
    return items;
  }, [active, quotes, sort, sortDir, listFilter]);

  // Debounced Jupiter search (name / symbol / mint)
  useEffect(() => {
    const q = addMint.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    // Full mint paste → no need to search dropdown; Add handles it
    if (BASE58_RE.test(q) && q.length >= 32) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearchLoading(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lists/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const text = await res.text();
        let data: { results?: SearchHit[]; error?: string } = {};
        try {
          data = text ? (JSON.parse(text) as typeof data) : {};
        } catch {
          if (seq === searchSeq.current) {
            setSearchError("Search unavailable");
            setSearchHits([]);
          }
          return;
        }
        if (seq !== searchSeq.current) return;
        setSearchHits(Array.isArray(data.results) ? data.results : []);
        setSearchError(data.error && (!data.results || data.results.length === 0) ? data.error : null);
        setSearchOpen(true);
      } catch {
        if (seq === searchSeq.current) {
          setSearchError("Search failed");
          setSearchHits([]);
        }
      } finally {
        if (seq === searchSeq.current) setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [addMint]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onSortClick = (key: SortKey) => {
    if (key === sort) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      const opt = SORT_OPTIONS.find((o) => o.key === key)!;
      setSort(key);
      setSortDir(opt.defaultDir);
    }
  };

  const handleCreateList = () => {
    const name = window.prompt("New list name");
    if (!name?.trim()) return;
    try {
      const list = createList(name, publicKey);
      refresh();
      setActiveId(list.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not create list");
    }
  };

  const handleRename = () => {
    if (!active) return;
    const name = window.prompt("Rename list", active.name);
    if (!name?.trim()) return;
    renameList(active.id, name, publicKey);
    refresh();
  };

  const handleDelete = () => {
    if (!active) return;
    if (lists.length <= 1) {
      // clear items instead of deleting last list
      if (!confirm("Clear all tokens from this list?")) return;
      const next = loadLists(publicKey).map((l) =>
        l.id === active.id
          ? { ...l, items: [], updatedAt: new Date().toISOString() }
          : l,
      );
      saveLists(next, publicKey);
      refresh();
      return;
    }
    if (!confirm(`Delete list “${active.name}”?`)) return;
    deleteList(active.id, publicKey);
    refresh();
  };

  const handleRemove = (mint: string) => {
    if (!active) return;
    removeFromList(active.id, mint, publicKey);
    refresh();
  };

  const commitAdd = useCallback(
    async (
      mint: string,
      meta?: { name?: string | null; symbol?: string | null; imageUrl?: string | null },
      prefill?: Partial<TokenQuote>,
    ) => {
      if (!active) return;
      if (!BASE58_RE.test(mint)) {
        setAddError("Invalid mint address");
        return;
      }
      if (active.items.some((it) => it.mint === mint)) {
        setAddError("Already in this list");
        return;
      }
      setAddBusy(true);
      setAddError(null);
      setAddWarn(null);
      let q: TokenQuote | undefined = prefill
        ? {
            mint,
            priceUsd: prefill.priceUsd ?? null,
            marketCapUsd: prefill.marketCapUsd ?? null,
            change24h: prefill.change24h ?? null,
            volume24h: prefill.volume24h ?? null,
            liquidityUsd: prefill.liquidityUsd ?? null,
            imageUrl: prefill.imageUrl ?? meta?.imageUrl ?? null,
            name: prefill.name ?? meta?.name ?? null,
            symbol: prefill.symbol ?? meta?.symbol ?? null,
            riskScore: null,
            riskLevel: "unknown",
            rugged: false,
            risks: [],
            sources: { jupiter: true, rugcheck: false },
          }
        : undefined;
      let quoteWarn: string | null = null;

      if (!q?.marketCapUsd && !q?.priceUsd) {
        try {
          const res = await fetch(`/api/lists/quotes?mints=${encodeURIComponent(mint)}`, {
            cache: "no-store",
          });
          const data = await readQuotesResponse(res);
          q = data.quotes[mint] ?? q;
          if (!q) {
            quoteWarn =
              data.httpError ||
              data.errors[0] ||
              "Added without live price — try Refresh prices";
          }
        } catch {
          quoteWarn = "Price lookup failed — token still added";
        }
      }

      try {
        addToList(
          active.id,
          {
            mint,
            name: q?.name ?? meta?.name ?? undefined,
            symbol: q?.symbol ?? meta?.symbol ?? undefined,
            imageUrl: q?.imageUrl ?? meta?.imageUrl ?? undefined,
          },
          publicKey,
        );
        if (q) setQuotes((prev) => ({ ...prev, [mint]: q! }));
        setAddMint("");
        setSearchHits([]);
        setSearchOpen(false);
        if (quoteWarn) setAddWarn(quoteWarn);
        refresh();
        const next = loadLists(publicKey).find((l) => l.id === active.id);
        if (next) void fetchQuotes(next.items.map((i) => i.mint));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not add token";
        setAddError(
          /valid JSON|Unexpected token|Internal S/i.test(msg)
            ? "Could not add token — try again"
            : msg,
        );
      } finally {
        setAddBusy(false);
      }
    },
    [active, publicKey, refresh, fetchQuotes],
  );

  const handleAddMint = async () => {
    const raw = addMint.trim();
    if (!raw) return;
    if (BASE58_RE.test(raw)) {
      await commitAdd(raw);
      return;
    }
    // Prefer top search hit when user hits Enter on a text query
    if (searchHits[0]) {
      const hit = searchHits[0];
      await commitAdd(
        hit.mint,
        { name: hit.name, symbol: hit.symbol, imageUrl: hit.imageUrl },
        {
          mint: hit.mint,
          name: hit.name,
          symbol: hit.symbol,
          imageUrl: hit.imageUrl,
          marketCapUsd: hit.marketCapUsd,
          priceUsd: hit.priceUsd,
          change24h: hit.change24h,
          liquidityUsd: hit.liquidityUsd,
        },
      );
      return;
    }
    setAddError("Pick a result or paste a mint address");
  };

  const handlePickSearch = async (hit: SearchHit) => {
    await commitAdd(
      hit.mint,
      { name: hit.name, symbol: hit.symbol, imageUrl: hit.imageUrl },
      {
        mint: hit.mint,
        name: hit.name,
        symbol: hit.symbol,
        imageUrl: hit.imageUrl,
        marketCapUsd: hit.marketCapUsd,
        priceUsd: hit.priceUsd,
        change24h: hit.change24h,
        liquidityUsd: hit.liquidityUsd,
      },
    );
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={28} className="text-purple-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-7 lg:py-10 space-y-4 sm:space-y-6">
        <header className="space-y-1 sm:space-y-1.5">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight flex items-center gap-2">
            <Star className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 fill-amber-400 shrink-0" />
            Lists
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-white/40 leading-relaxed max-w-xl">
            <span className="hidden sm:inline">Star tokens you care about. Multiple lists · sort by market cap or change. </span>
            <span className="sm:hidden">Watchlists · MC · 24h · risk. </span>
            {publicKey ? (
              <span className="text-gray-400 dark:text-white/30 font-mono">
                {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
              </span>
            ) : (
              <span className="text-gray-400 dark:text-white/30">
                Device list · connect to sync per wallet
              </span>
            )}
          </p>
        </header>

        {/* List tabs — horizontal scroll on phone, wrap on tablet+ */}
        <div className="scroll-x-strip sm:flex-wrap sm:overflow-visible -mx-1 px-1 pb-0.5">
          {lists.map((l) => {
            const on = l.id === active?.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setActiveId(l.id)}
                className={`shrink-0 px-3.5 py-2 min-h-[40px] rounded-xl text-sm border transition cursor-pointer ${
                  on
                    ? "bg-purple-500/15 border-purple-400/40 text-purple-600 dark:text-purple-300"
                    : "border-black/10 dark:border-white/10 text-gray-500 dark:text-white/50 hover:border-purple-400/30"
                }`}
              >
                <List size={13} className="inline mr-1 opacity-60" />
                {l.name}
                <span className="ml-1.5 text-[10px] opacity-50 font-mono">{l.items.length}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleCreateList}
            className="shrink-0 px-3 py-2 min-h-[40px] rounded-xl text-sm border border-dashed border-black/15 dark:border-white/15 text-gray-500 dark:text-white/40 hover:text-purple-400 hover:border-purple-400/40 transition cursor-pointer"
          >
            <Plus size={14} className="inline" /> New
          </button>
        </div>

        {active && (
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRename}
              className="text-xs text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/70 inline-flex items-center gap-1 cursor-pointer px-2 py-2 min-h-[40px] rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Pencil size={12} /> Rename
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-gray-500 dark:text-white/40 hover:text-red-400 inline-flex items-center gap-1 cursor-pointer px-2 py-2 min-h-[40px] rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Trash2 size={12} /> {lists.length <= 1 ? "Clear" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => active && fetchQuotes(active.items.map((i) => i.mint))}
              className="text-xs text-gray-500 dark:text-white/40 hover:text-purple-400 inline-flex items-center gap-1 cursor-pointer ml-auto px-2 py-2 min-h-[40px] rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              disabled={quotesLoading}
            >
              <RefreshCw size={12} className={quotesLoading ? "animate-spin" : ""} />
              <span className="hidden xs:inline sm:inline">Refresh</span>
              <span className="sm:hidden">Sync</span>
            </button>
          </div>
        )}

        {/* Sort bar */}
        <div className="scroll-x-strip sm:flex-wrap sm:overflow-visible items-center -mx-1 px-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30 shrink-0 px-1">
            <ArrowUpDown size={11} className="inline mr-0.5" />
            Sort
          </span>
          {SORT_OPTIONS.map((opt) => {
            const on = sort === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSortClick(opt.key)}
                className={`shrink-0 px-3 py-2 min-h-[36px] rounded-lg text-xs border transition cursor-pointer ${
                  on
                    ? "bg-black/8 dark:bg-white/10 border-black/15 dark:border-white/20 text-gray-900 dark:text-white"
                    : "border-transparent text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {opt.label}
                {on && (
                  <span className="ml-1 opacity-50 font-mono">
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search / add */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1" ref={searchBoxRef}>
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 z-10"
              />
              {searchLoading && (
                <Spinner
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400"
                />
              )}
              <input
                value={addMint}
                onChange={(e) => {
                  setAddMint(e.target.value);
                  setAddError(null);
                  setAddWarn(null);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddMint();
                  }
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Search name, ticker, or paste mint…"
                className="w-full pl-9 pr-9 py-3 sm:py-2.5 min-h-[48px] sm:min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-base sm:text-sm placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/40"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {searchOpen && (searchHits.length > 0 || searchError || (addMint.trim().length >= 2 && !searchLoading && !BASE58_RE.test(addMint.trim()))) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[min(60dvh,22rem)] sm:max-h-80 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-xl overscroll-contain">
                  {searchError && searchHits.length === 0 && (
                    <p className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{searchError}</p>
                  )}
                  {searchHits.length === 0 && !searchLoading && !searchError && (
                    <p className="px-3 py-2 text-xs text-gray-400 dark:text-white/40">No tokens found</p>
                  )}
                  {searchHits.map((hit) => {
                    const inList = active?.items.some((it) => it.mint === hit.mint);
                    return (
                      <button
                        key={hit.mint}
                        type="button"
                        disabled={!!inList || addBusy}
                        onClick={() => void handlePickSearch(hit)}
                        className="w-full flex items-center gap-2.5 px-3 py-3 sm:py-2.5 min-h-[56px] text-left hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/5 dark:active:bg-white/5 transition disabled:opacity-50 cursor-pointer disabled:cursor-default"
                      >
                        <ImageWithPlaceholder
                          src={hit.imageUrl}
                          alt=""
                          className="w-8 h-8 rounded-lg shrink-0"
                          fallback={<Star size={12} />}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-semibold truncate">
                              {hit.name || shortMint(hit.mint)}
                            </span>
                            {hit.symbol && (
                              <span className="text-xs font-mono text-gray-500 dark:text-white/40 shrink-0">
                                ${hit.symbol}
                              </span>
                            )}
                            {hit.verified && (
                              <span className="text-[9px] uppercase tracking-wider text-green-500 shrink-0">
                                verified
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400 dark:text-white/30">
                            <span>{shortMint(hit.mint)}</span>
                            {hit.marketCapUsd != null && (
                              <span>MC {formatMcap(hit.marketCapUsd)}</span>
                            )}
                            {hit.change24h != null && (
                              <span
                                className={
                                  hit.change24h >= 0
                                    ? "text-green-500"
                                    : "text-red-500"
                                }
                              >
                                {formatChange(hit.change24h)}
                              </span>
                            )}
                          </div>
                        </div>
                        {inList ? (
                          <Check size={14} className="text-green-500 shrink-0" />
                        ) : (
                          <Plus size={14} className="text-purple-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleAddMint()}
              disabled={addBusy || !addMint.trim()}
              className="px-4 py-3 sm:py-2.5 min-h-[48px] sm:min-h-[44px] rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-600 dark:text-purple-300 text-sm font-medium hover:bg-purple-500/25 transition cursor-pointer disabled:opacity-40 shrink-0"
            >
              {addBusy ? "…" : "Add"}
            </button>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          {addWarn && !addError && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{addWarn}</p>
          )}
        </div>

        {/* Filter within list */}
        {active && active.items.length > 3 && (
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30"
            />
            <input
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="Filter this list…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-black/5 dark:border-white/5 bg-transparent text-xs placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:border-purple-400/30"
            />
          </div>
        )}

        {quotesError && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300 flex items-start justify-between gap-2">
            <span>{quotesError}</span>
            <button
              type="button"
              onClick={() => active && fetchQuotes(active.items.map((i) => i.mint))}
              className="shrink-0 underline cursor-pointer hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        {quotesWarn && !quotesError && (
          <div className="rounded-xl border border-black/8 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-500 dark:text-white/45 flex items-start justify-between gap-2">
            <span>{quotesWarn}</span>
            <button
              type="button"
              onClick={() => {
                setQuotesWarn(null);
                active && fetchQuotes(active.items.map((i) => i.mint));
              }}
              className="shrink-0 underline cursor-pointer hover:no-underline text-gray-400"
            >
              Retry risk
            </button>
          </div>
        )}

        {/* Token table */}
        {!active || (active.items.length === 0) ? (
          <div className="text-center py-16 space-y-3 border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
            <Star className="w-10 h-10 text-gray-300 dark:text-white/15 mx-auto" />
            <p className="text-gray-500 dark:text-white/40 text-sm">
              No tokens in this list yet
            </p>
            <p className="text-xs text-gray-400 dark:text-white/30 max-w-xs mx-auto">
              Search a name or ticker above, paste a mint, or star from a token page. Browse{" "}
              <Link href="/launch" className="text-purple-400 hover:underline">
                live launches
              </Link>{" "}
              or{" "}
              <Link href="/whats-new" className="text-purple-400 hover:underline">
                what&apos;s new
              </Link>
              .
            </p>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400 dark:text-white/40">
            No matches for “{listFilter}”
          </div>
        ) : (
          <>
            {/* Phone: stacked cards */}
            <ul className="md:hidden space-y-2">
              {sortedItems.map((item) => (
                <TokenCard
                  key={item.mint}
                  item={item}
                  quote={quotes[item.mint]}
                  onRemove={() => handleRemove(item.mint)}
                />
              ))}
            </ul>

            {/* Tablet + desktop: table */}
            <div className="hidden md:block rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
              <div className="grid grid-cols-[1fr_64px_88px_72px_48px] lg:grid-cols-[1fr_72px_100px_80px_52px] gap-2 px-3 lg:px-4 py-2.5 text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/5 dark:border-white/5">
                <button type="button" onClick={() => onSortClick("name")} className="text-left cursor-pointer hover:text-gray-600 dark:hover:text-white/50">
                  Token
                </button>
                <span className="text-right">Risk</span>
                <button type="button" onClick={() => onSortClick("mc")} className="text-right cursor-pointer hover:text-gray-600 dark:hover:text-white/50">
                  MC
                </button>
                <button type="button" onClick={() => onSortClick("change")} className="text-right cursor-pointer hover:text-gray-600 dark:hover:text-white/50">
                  24h
                </button>
                <span />
              </div>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {sortedItems.map((item) => (
                  <TokenRow
                    key={item.mint}
                    item={item}
                    quote={quotes[item.mint]}
                    onRemove={() => handleRemove(item.mint)}
                  />
                ))}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function RiskBadge({ quote }: { quote?: TokenQuote }) {
  if (!quote || quote.riskLevel === "unknown" || quote.riskScore == null) {
    if (quote?.error && !quote.sources?.jupiter && !quote.sources?.rugcheck) {
      return (
        <span className="text-[10px] text-gray-400 dark:text-white/30" title={quote.error}>
          —
        </span>
      );
    }
    return <span className="text-[10px] text-gray-400 dark:text-white/30">—</span>;
  }
  const level = quote.rugged ? "danger" : quote.riskLevel ?? "unknown";
  const styles =
    level === "danger"
      ? "bg-red-500/15 text-red-500 border-red-500/25"
      : level === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
        : "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/25";
  const tip = [
    quote.rugged ? "Flagged rugged" : null,
    quote.risks?.slice(0, 3).map((r) => r.name).join(" · ") || null,
    quote.lpLockedPct != null ? `LP locked ${quote.lpLockedPct.toFixed(0)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <a
      href={`https://rugcheck.xyz/tokens/${quote.mint}`}
      target="_blank"
      rel="noopener noreferrer"
      title={tip || "RugCheck"}
      className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${styles}`}
      onClick={(e) => e.stopPropagation()}
    >
      {quote.rugged ? "RUG" : Math.round(quote.riskScore)}
    </a>
  );
}

function tokenDisplay(item: ListItem, quote?: TokenQuote) {
  return {
    name: quote?.name || item.name || shortMint(item.mint),
    symbol: quote?.symbol || item.symbol,
    image: quote?.imageUrl || item.imageUrl,
    change: quote?.change24h,
    changeColor:
      quote?.change24h == null
        ? "text-gray-400 dark:text-white/30"
        : quote.change24h >= 0
          ? "text-green-500 dark:text-green-400"
          : "text-red-500 dark:text-red-400",
  };
}

/** Mobile / narrow: tappable card */
function TokenCard({
  item,
  quote,
  onRemove,
}: {
  item: ListItem;
  quote?: TokenQuote;
  onRemove: () => void;
}) {
  const { name, symbol, image, change, changeColor } = tokenDisplay(item, quote);
  return (
    <li className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.015] dark:bg-white/[0.02] overflow-hidden">
      <div className="flex items-stretch">
        <Link
          href={`/token/${item.mint}`}
          className="flex-1 flex items-center gap-3 min-w-0 p-3 active:bg-black/5 dark:active:bg-white/5"
        >
          <ImageWithPlaceholder
            src={image}
            alt=""
            className="w-11 h-11 rounded-xl shrink-0"
            fallback={<Star size={16} />}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[15px] truncate">{name}</span>
              {symbol && (
                <span className="text-xs font-mono text-gray-500 dark:text-white/40 shrink-0">
                  ${symbol}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-mono tabular-nums text-gray-700 dark:text-white/70">
                {formatMcap(quote?.marketCapUsd)}
              </span>
              <span className={`text-xs font-mono tabular-nums ${changeColor}`}>
                {formatChange(change)}
              </span>
              <RiskBadge quote={quote} />
            </div>
          </div>
        </Link>
        <div className="flex flex-col border-l border-black/5 dark:border-white/5">
          <a
            href={`https://jup.ag/tokens/${item.mint}?refId=yfgv2ibxy07v`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center px-3 text-gray-400 dark:text-white/30 active:text-purple-400 min-w-[44px]"
            title="Jupiter"
          >
            <ExternalLink size={16} />
          </a>
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 flex items-center justify-center px-3 text-gray-400 dark:text-white/30 active:text-red-400 border-t border-black/5 dark:border-white/5 cursor-pointer min-w-[44px]"
            title="Remove"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

/** md+: dense table row */
function TokenRow({
  item,
  quote,
  onRemove,
}: {
  item: ListItem;
  quote?: TokenQuote;
  onRemove: () => void;
}) {
  const { name, symbol, image, change, changeColor } = tokenDisplay(item, quote);

  return (
    <li className="grid grid-cols-[1fr_64px_88px_72px_48px] lg:grid-cols-[1fr_72px_100px_80px_52px] gap-2 items-center px-3 lg:px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition group min-h-[56px]">
      <Link
        href={`/token/${item.mint}`}
        className="flex items-center gap-2.5 min-w-0"
      >
        <ImageWithPlaceholder
          src={image}
          alt=""
          className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg shrink-0"
          fallback={<Star size={14} />}
        />
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-sm truncate">{name}</span>
            {symbol && (
              <span className="text-xs font-mono text-gray-500 dark:text-white/40 shrink-0">
                ${symbol}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-gray-400 dark:text-white/25">
            {shortMint(item.mint)}
            {quote?.error && !quote.sources?.jupiter ? (
              <span className="ml-1 text-amber-500/80">· no quote</span>
            ) : null}
          </span>
        </div>
      </Link>
      <div className="text-right">
        <RiskBadge quote={quote} />
      </div>
      <div className="text-right text-xs lg:text-sm font-mono tabular-nums text-gray-700 dark:text-white/70">
        {formatMcap(quote?.marketCapUsd)}
      </div>
      <div className={`text-right text-xs lg:text-sm font-mono tabular-nums ${changeColor}`}>
        {formatChange(change)}
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <a
          href={`https://jup.ag/tokens/${item.mint}?refId=yfgv2ibxy07v`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-gray-300 dark:text-white/20 hover:text-purple-400 transition opacity-100 md:opacity-0 md:group-hover:opacity-100"
          title="Jupiter"
        >
          <ExternalLink size={14} />
        </a>
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-gray-300 dark:text-white/20 hover:text-red-400 transition cursor-pointer"
          title="Remove"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
