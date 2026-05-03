"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ChevronLeft, ChevronRight, Sparkles, ExternalLink } from "lucide-react";
import { timeAgo } from "@/lib/time";
import { useNetwork } from "@/lib/network";

type Token = {
  id: number;
  wallet: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  mint_address: string;
  network: "mainnet" | "devnet" | null;
  created_at: string;
};

const NETWORK_LABEL: Record<string, string> = { mainnet: "live", devnet: "test" };

type Resp = {
  tokens: Token[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

const LIMIT = 20;

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function WhatsNewPage() {
  const { network, toggle } = useNetwork();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, n: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), limit: String(LIMIT), network: n });
      const res = await fetch(`/api/tokens/recent?${qs}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, network); }, [page, network, load]);
  useEffect(() => { setPage(1); }, [network]);

  const tokens = data?.tokens ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-orange-400" /> What's new
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/40">
            <span>
              {data
                ? `${data.total.toLocaleString()} ${network === "mainnet" ? "live" : "test"} launch${data.total === 1 ? "" : "es"}`
                : "Loading…"}
            </span>
            <button
              type="button"
              onClick={toggle}
              title={`Switch to ${network === "mainnet" ? "test" : "live"}`}
              className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider cursor-pointer transition ${
                network === "mainnet"
                  ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                  : "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
              }`}
            >
              {network === "mainnet" ? "live" : "test"}
            </button>
          </div>
        </header>

        {loading && page === 1 && (
          <div className="rounded-2xl border border-orange-400/20 bg-orange-500/5 px-5 py-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-orange-400/15" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-orange-400/20" />
                <div className="h-5 w-2/3 rounded bg-orange-400/15" />
                <div className="h-3 w-1/2 rounded bg-orange-400/10" />
              </div>
            </div>
          </div>
        )}
        {!loading && data && tokens[0] && page === 1 && (
          <Link
            href={`/launch/${tokens[0].mint_address}`}
            className="block rounded-2xl border border-orange-400/30 bg-orange-500/5 hover:bg-orange-500/10 transition px-5 py-5"
          >
            <div className="flex items-center gap-4">
              {tokens[0].image_url && (
                <img
                  src={tokens[0].image_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover ring-1 ring-orange-400/30"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider text-orange-400 mb-0.5">Latest launch</div>
                <div className="font-semibold text-lg truncate">
                  {tokens[0].name} <span className="text-gray-400 dark:text-white/40 font-mono text-sm">${tokens[0].symbol}</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-white/40 font-mono mt-0.5 flex items-center gap-2">
                  <span>{short(tokens[0].mint_address)}</span>
                  <span>·</span>
                  <span>{timeAgo(tokens[0].created_at)}</span>
                  {tokens[0].network && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider not-italic ${
                      tokens[0].network === "mainnet"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    }`}>
                      {NETWORK_LABEL[tokens[0].network] ?? tokens[0].network}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-orange-400/60 shrink-0" />
            </div>
          </Link>
        )}

        <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {loading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 rounded bg-black/5 dark:bg-white/10" />
                    <div className="h-2.5 w-2/3 rounded bg-black/5 dark:bg-white/5" />
                  </div>
                  <div className="h-2.5 w-12 rounded bg-black/5 dark:bg-white/5 shrink-0" />
                </div>
              ))}
            </>
          ) : tokens.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-white/30">No tokens yet.</div>
          ) : (
            tokens.slice(page === 1 ? 1 : 0).map((t) => (
              <Link
                key={t.id}
                href={`/launch/${t.mint_address}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                {t.image_url ? (
                  <img src={t.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    <span className="text-xs font-mono text-gray-400 dark:text-white/40 shrink-0">${t.symbol}</span>
                    {t.network && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 ${
                        t.network === "mainnet"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}>
                        {NETWORK_LABEL[t.network] ?? t.network}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-white/30 font-mono truncate">
                    {short(t.mint_address)} · by {short(t.wallet)}
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-white/30 shrink-0">{timeAgo(t.created_at)}</span>
              </Link>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-gray-500 dark:text-white/40">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => (data?.hasMore ? p + 1 : p))}
              disabled={!data?.hasMore || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
