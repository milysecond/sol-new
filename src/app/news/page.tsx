"use client";

import { useEffect, useState, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { timeAgo } from "@/lib/time";

type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  image: string | null;
  solana?: boolean;
};

const SOURCE_COLOR: Record<string, string> = {
  Cointelegraph: "text-yellow-500 bg-yellow-500/10",
  Decrypt: "text-sky-500 bg-sky-500/10",
  "The Defiant": "text-fuchsia-500 bg-fuchsia-500/10",
  "Solana ANZ": "text-emerald-500 bg-emerald-500/10",
  "devrels.xyz": "text-violet-500 bg-violet-500/10",
};

function ago(iso: string): string {
  if (!iso) return "";
  // timeAgo appends "Z"; our values are already ISO with Z, so strip it first.
  return timeAgo(iso.replace(/Z$/, "").replace(/\.\d+$/, ""));
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items?: NewsItem[] };
        setItems(data.items ?? []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lead = items?.[0];
  const rest = items?.slice(1) ?? [];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="app-shell-wide py-8 space-y-6 pb-24 sm:pb-8">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Newspaper className="w-7 h-7 text-sky-500" /> News
            </h1>
            <p className="text-sm text-gray-500 dark:text-white/40">
              Latest from across Solana &amp; crypto.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer disabled:opacity-40"
          >
            {loading ? <Spinner size={16} state="searching" /> : <RefreshCw className="w-4 h-4" />} Refresh
          </button>
        </header>

        {/* Lead story */}
        {loading && !items ? (
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/5 px-5 py-5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-sky-400/15" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-sky-400/20" />
                <div className="h-5 w-2/3 rounded bg-sky-400/15" />
                <div className="h-3 w-1/2 rounded bg-sky-400/10" />
              </div>
            </div>
          </div>
        ) : lead ? (
          <a
            href={lead.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-sky-400/30 bg-sky-500/5 hover:bg-sky-500/10 transition px-5 py-5"
          >
            <div className="flex items-center gap-4">
              {lead.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lead.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-xl object-cover ring-1 ring-sky-400/30 shrink-0 bg-sky-500/10"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (el.dataset.fb) return;
                    el.dataset.fb = "1";
                    el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.source.slice(0, 12))}&background=0ea5e9&color=fff&size=128&bold=true`;
                  }}
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                  <Newspaper className="w-7 h-7 text-sky-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase tracking-wider text-sky-500 font-semibold">Top story</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLOR[lead.source] ?? "text-gray-500 bg-black/5 dark:bg-white/10"}`}>
                    {lead.source}
                  </span>
                </div>
                <div className="font-semibold text-lg leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-300 transition line-clamp-3">
                  {lead.title}
                </div>
                {lead.pubDate && (
                  <div className="text-xs text-gray-400 dark:text-white/30 mt-1">{ago(lead.pubDate)}</div>
                )}
              </div>
              <ExternalLink className="w-4 h-4 text-sky-400/60 shrink-0" />
            </div>
          </a>
        ) : null}

        {/* List */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {loading && !items ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-black/5 dark:bg-white/10 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-black/5 dark:bg-white/10" />
                  <div className="h-2.5 w-1/3 rounded bg-black/5 dark:bg-white/5" />
                </div>
              </div>
            ))
          ) : rest.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-white/30">
              Couldn’t load news right now. Try refreshing in a moment.
            </div>
          ) : (
            rest.map((n, i) => (
              <a
                key={`${n.link}-${i}`}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                {n.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-lg object-cover shrink-0 bg-black/5 dark:bg-white/10"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.dataset.fb) return;
                      el.dataset.fb = "1";
                      el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(n.source.slice(0, 10))}&background=7c3aed&color=fff&size=96&bold=true`;
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                    <Newspaper className="w-5 h-5 text-gray-300 dark:text-white/20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-snug line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition">
                    {n.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-white/30">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLOR[n.source] ?? "text-gray-500 bg-black/5 dark:bg-white/10"}`}>
                      {n.source}
                    </span>
                    {n.pubDate && <span>{ago(n.pubDate)}</span>}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-300 dark:text-white/20 group-hover:text-sky-400 transition shrink-0" />
              </a>
            ))
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          Headlines aggregated from public RSS feeds. Links open the original source.
        </p>
      </main>
    </div>
  );
}
