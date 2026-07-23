"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, ExternalLink, Search, Layers } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { fastIpfsUrl } from "@/lib/ipfs";
import { PublicKey } from "@solana/web3.js";
import { Suspense } from "react";

type SortKey = "recent" | "name" | "price_asc" | "price_desc";

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

function formatSol(n: number): string {
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toFixed(4);
}

function NftsBrowseInner() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [tab, setTab] = useState<"owned" | "listed">("owned");
  const [sort, setSort] = useState<SortKey>("recent");
  const [items, setItems] = useState<NftCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = searchParams.get("owner")?.trim();
    let sessionOwner: string | null = null;
    try {
      sessionOwner = sessionStorage.getItem("sol.new.nfts.owner");
      if (sessionOwner) sessionStorage.removeItem("sol.new.nfts.owner");
    } catch {
      /* ignore */
    }
    const initial = q || sessionOwner;
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

  const load = useCallback(async (addr: string, p: number, t: "owned" | "listed", s: SortKey) => {
    setLoading(true);
    setError(null);
    try {
      new PublicKey(addr);
      const path =
        t === "listed"
          ? `/api/nfts/listings?owner=${encodeURIComponent(addr)}&sort=${s}`
          : `/api/nfts?owner=${encodeURIComponent(addr)}&page=${p}&limit=48&sort=${s}`;
      const res = await fetch(path, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        items?: NftCard[];
        total?: number;
        note?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items || []);
      setTotal(data.total ?? data.items?.length ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Failed to load NFTs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!owner) return;
    void load(owner, page, tab, sort);
  }, [owner, page, tab, sort, load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = input.trim();
    try {
      new PublicKey(a);
      setOwner(a);
      setPage(1);
      router.replace(`/nfts?owner=${encodeURIComponent(a)}`);
    } catch {
      setError("Invalid Solana address");
    }
  };

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

            <form onSubmit={submit} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Wallet address"
                className="flex-1 px-3 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono focus:outline-none focus:border-purple-400/50"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Search size={16} /> Look up
              </button>
            </form>

            {publicKey && owner !== publicKey && (
              <button
                type="button"
                onClick={() => {
                  setInput(publicKey);
                  setOwner(publicKey);
                  setPage(1);
                }}
                className="text-xs text-purple-400 hover:underline cursor-pointer"
              >
                Use my wallet
              </button>
            )}

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
              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="text-xs text-gray-500 dark:text-white/40">Sort</label>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as SortKey);
                    setPage(1);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 cursor-pointer"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="price_asc">Price: low to high</option>
                </select>
              </div>
            )}

            {tab === "listed" && (
              <p className="text-xs text-center text-gray-500 dark:text-white/40">
                Prices from Magic Eden (active list or collection floor). Trade on Tensor or ME.
              </p>
            )}

            {(sort === "price_asc" || sort === "price_desc") && tab === "owned" && (
              <p className="text-xs text-center text-gray-500 dark:text-white/40">
                Price uses ME listing when listed, else collection floor. Unpriced last.
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
                <p className="text-gray-400">No NFTs found for this wallet</p>
                <Link href="/nft" className="text-purple-400 text-sm hover:underline">
                  Mint one
                </Link>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 text-center">
                  {total} item{total === 1 ? "" : "s"}
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
                      <div className="aspect-square bg-black/10 dark:bg-white/5">
                        {n.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fastIpfsUrl(n.image) || n.image}
                            alt={n.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <ImageIcon size={28} />
                          </div>
                        )}
                      </div>
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
                        {n.compressed && (
                          <span className="text-[10px] uppercase tracking-wide text-emerald-500">
                            compressed
                          </span>
                        )}
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
