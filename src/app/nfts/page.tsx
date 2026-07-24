"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, ExternalLink, Search, Layers, Filter, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { ImageWithPlaceholder } from "@/components/image-with-placeholder";
import { useWallet } from "@/lib/wallet-context";
import { fastIpfsUrl } from "@/lib/ipfs";
import { PublicKey } from "@solana/web3.js";
import { Suspense } from "react";
import { resolveRecipient } from "@/lib/resolve-name";

type SortKey = "recent" | "name" | "price_asc" | "price_desc";
type TypeFilter = "all" | "compressed" | "standard";
type ListedFilter = "all" | "listed" | "unlisted";
type PriceFilter = "all" | "priced" | "unpriced";

type NftCard = {
  id: string;
  mint: string;
  name: string;
  symbol: string | null;
  description: string | null;
  image: string | null;
  collection: string | null;
  compressed: boolean;
  meUrl: string;
  tensorUrl: string;
  solscanUrl: string;
  priceSol?: number | null;
  priceSource?: "listing" | "floor" | null;
  listed?: boolean;
  listingUrl?: string;
};

type Facet = { id: string; count: number };

function formatSol(n: number): string {
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toFixed(4);
}

function shortCol(id: string) {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function NftsBrowseInner() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [tab, setTab] = useState<"owned" | "listed">("owned");
  const [sort, setSort] = useState<SortKey>("recent");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [typeF, setTypeF] = useState<TypeFilter>("all");
  const [listedF, setListedF] = useState<ListedFilter>("all");
  const [priceF, setPriceF] = useState<PriceFilter>("all");
  const [collection, setCollection] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<NftCard[]>([]);
  const [collections, setCollections] = useState<Facet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const o = searchParams.get("owner")?.trim();
    let sessionOwner: string | null = null;
    try {
      sessionOwner = sessionStorage.getItem("sol.new.nfts.owner");
      if (sessionOwner) sessionStorage.removeItem("sol.new.nfts.owner");
    } catch {
      /* ignore */
    }
    const initial = o || sessionOwner;
    if (initial) {
      try {
        new PublicKey(initial);
        setOwner(initial);
        setInput(initial);
        return;
      } catch {
        /* fall through */
      }
    }
    if (publicKey && !owner) {
      setOwner(publicKey);
      setInput(publicKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, searchParams]);

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (qDebounced) p.set("q", qDebounced);
    if (typeF !== "all") p.set("type", typeF);
    if (listedF !== "all") p.set("listed", listedF);
    if (priceF !== "all") p.set("price", priceF);
    if (collection) p.set("collection", collection);
    return p.toString();
  }, [qDebounced, typeF, listedF, priceF, collection]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (qDebounced) n++;
    if (typeF !== "all") n++;
    if (listedF !== "all") n++;
    if (priceF !== "all") n++;
    if (collection) n++;
    return n;
  }, [qDebounced, typeF, listedF, priceF, collection]);

  const load = useCallback(
    async (
      addr: string,
      p: number,
      t: "owned" | "listed",
      s: SortKey,
      fq: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        new PublicKey(addr);
        const base =
          t === "listed"
            ? `/api/nfts/listings?owner=${encodeURIComponent(addr)}&sort=${s}`
            : `/api/nfts?owner=${encodeURIComponent(addr)}&page=${p}&limit=48&sort=${s}`;
        const path = fq ? `${base}&${fq}` : base;
        const res = await fetch(path, { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          items?: NftCard[];
          total?: number;
          collections?: Facet[];
        };
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setItems(data.items || []);
        setTotal(data.total ?? data.items?.length ?? 0);
        if (data.collections) setCollections(data.collections);
      } catch (e) {
        setItems([]);
        setTotal(0);
        setError(e instanceof Error ? e.message : "Failed to load NFTs");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!owner) return;
    void load(owner, page, tab, sort, filterQuery);
  }, [owner, page, tab, sort, filterQuery, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = input.trim();
    if (!a) return;
    setError(null);
    setLoading(true);
    try {
      const result = await resolveRecipient(a);
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setOwner(result.owner);
      setInput(result.kind !== "pubkey" ? a : result.owner);
      setPage(1);
      router.replace(`/nfts?owner=${encodeURIComponent(result.owner)}`);
    } catch {
      setError("Could not resolve address");
      setLoading(false);
    }
  };

  const clearAddress = () => {
    setInput("");
    setOwner(null);
    setItems([]);
    setTotal(0);
    setError(null);
    setPage(1);
    router.replace("/nfts");
  };

  const clearFilters = () => {
    setQ("");
    setQDebounced("");
    setTypeF("all");
    setListedF("all");
    setPriceF("all");
    setCollection("");
    setPage(1);
  };

  const selectCls = "px-2.5 py-1.5 rounded-lg text-xs sm:text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 cursor-pointer";
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs transition cursor-pointer border ${
      active
        ? "bg-purple-500/15 text-purple-800 dark:text-purple-200 border-purple-400/50"
        : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-500 border-black/10 dark:border-white/10 hover:border-purple-400/30"
    }`;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <PageTransition>
          <div className="w-full sm:max-w-4xl space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <Layers className="text-purple-400" size={36} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">NFTs</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">
                Browse any wallet. Mint at{" "}
                <Link href="/nft" className="text-purple-400 hover:underline">
                  /nft
                </Link>
                .
              </p>
            </div>

            <form onSubmit={(e) => void submit(e)} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Address or name.sol / .bonk / .skr"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full px-3 py-2.5 pr-9 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-400/50"
                />
                {input && (
                  <button
                    type="button"
                    onClick={clearAddress}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white cursor-pointer"
                    aria-label="Clear address"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Search size={16} /> Look up
              </button>
            </form>

            <div className="flex flex-wrap gap-3 justify-center">
              {publicKey && owner !== publicKey && (
                <button
                  type="button"
                  onClick={() => {
                    setInput(publicKey);
                    setOwner(publicKey);
                    setPage(1);
                    router.replace(`/nfts?owner=${encodeURIComponent(publicKey)}`);
                  }}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                >
                  Use my wallet
                </button>
              )}
              {owner && (
                <button
                  type="button"
                  onClick={clearAddress}
                  className="text-xs text-gray-500 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {owner && (
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab("owned");
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                    tab === "owned"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-400/50"
                      : "bg-black/5 dark:bg-white/5 text-gray-500 border border-black/10 dark:border-white/10"
                  }`}
                >
                  Owned
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("listed");
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                    tab === "listed"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-400/50"
                      : "bg-black/5 dark:bg-white/5 text-gray-500 border border-black/10 dark:border-white/10"
                  }`}
                >
                  Markets
                </button>
              </div>
            )}

            {owner && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="relative flex-1 min-w-[140px] max-w-xs">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Filter by name or mint"
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:outline-none focus:border-purple-400/50"
                    />
                  </div>
                  <label className="text-xs text-gray-500 dark:text-white/40">Sort</label>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as SortKey);
                      setPage(1);
                    }}
                    className={selectCls}
                  >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="price_desc">Price: high to low</option>
                    <option value="price_asc">Price: low to high</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm border transition cursor-pointer ${
                      showFilters || activeFilterCount > 0
                        ? "bg-purple-500/20 text-purple-300 border-purple-400/50"
                        : "bg-black/5 dark:bg-white/5 text-gray-500 border-black/10 dark:border-white/10"
                    }`}
                  >
                    <Filter size={14} />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="ml-0.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-purple-500 text-[10px] text-white flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 cursor-pointer"
                    >
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>

                {showFilters && (
                  <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3 sm:p-4 space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">
                        Type
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["all", "All"],
                            ["compressed", "Compressed"],
                            ["standard", "Standard"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setTypeF(v);
                              setPage(1);
                            }}
                            className={chip(typeF === v)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">
                        Listing
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["all", "All"],
                            ["listed", "Listed"],
                            ["unlisted", "Unlisted"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setListedF(v);
                              setPage(1);
                            }}
                            className={chip(listedF === v)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">
                        Price
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            ["all", "All"],
                            ["priced", "Has price"],
                            ["unpriced", "No price"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setPriceF(v);
                              setPage(1);
                            }}
                            className={chip(priceF === v)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {collections.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">
                          Collection
                        </p>
                        <select
                          value={collection}
                          onChange={(e) => {
                            setCollection(e.target.value);
                            setPage(1);
                          }}
                          className={`${selectCls} w-full sm:w-auto max-w-full`}
                        >
                          <option value="">All collections</option>
                          {collections.map((c) => (
                            <option key={c.id} value={c.id}>
                              {shortCol(c.id)} ({c.count})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "listed" && (
              <p className="text-xs text-center text-gray-500 dark:text-white/40">
                Markets show items with a listing or floor estimate.
              </p>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner size={28} />
              </div>
            ) : !owner ? (
              <p className="text-center text-gray-400 py-12 text-sm">
                Connect a wallet or paste an address to browse.
              </p>
            ) : items.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <ImageIcon className="mx-auto text-gray-400" size={32} />
                <p className="text-gray-400">
                  {activeFilterCount > 0
                    ? "No NFTs match these filters"
                    : "No NFTs found for this wallet"}
                </p>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-purple-400 text-sm hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link href="/nft" className="text-purple-400 text-sm hover:underline">
                    Mint one
                  </Link>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 text-center">
                  {total} item{total === 1 ? "" : "s"}
                  {activeFilterCount > 0 ? " match" : ""}
                  {owner ? (
                    <span className="font-mono">
                      {" "}
                      · {owner.slice(0, 4)}…{owner.slice(-4)}
                    </span>
                  ) : null}
                </p>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((n) => (
                    <div
                      key={n.id}
                      className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden hover:border-purple-400/30 transition flex flex-col"
                    >
                      <ImageWithPlaceholder
                        src={n.image ? fastIpfsUrl(n.image) || n.image : null}
                        alt={n.name}
                        tone="purple"
                        className="aspect-square w-full"
                        fallback={<ImageIcon size={28} />}
                        loading="lazy"
                      />
                      <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                        <p className="font-semibold text-sm line-clamp-2">{n.name}</p>
                        {n.priceSol != null && Number.isFinite(n.priceSol) ? (
                          <p className="text-sm font-semibold text-purple-300">
                            {formatSol(n.priceSol)} SOL
                            <span className="ml-1 text-[10px] font-normal text-gray-500">
                              {n.priceSource === "listing"
                                ? "listed"
                                : n.priceSource === "floor"
                                  ? "floor"
                                  : ""}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">No price</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {n.compressed && (
                            <span className="text-[10px] uppercase tracking-wide text-emerald-500">
                              compressed
                            </span>
                          )}
                          {n.listed && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-500">
                              for sale
                            </span>
                          )}
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2 pt-1">
                          <a
                            href={n.tensorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-purple-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            Tensor <ExternalLink size={10} />
                          </a>
                          <a
                            href={n.meUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-purple-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            ME <ExternalLink size={10} />
                          </a>
                          <a
                            href={n.solscanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-400 hover:underline inline-flex items-center gap-0.5"
                          >
                            Solscan
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {tab === "owned" && total > page * 48 && (
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="text-sm text-gray-500 py-1.5">Page {page}</span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

export default function NftsBrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center text-gray-400">
          Loading…
        </div>
      }
    >
      <NftsBrowseInner />
    </Suspense>
  );
}
