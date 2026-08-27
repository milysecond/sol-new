"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { Trophy, RefreshCw, Medal, ExternalLink } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { PageTransition } from "@/components/page-transition";
import { useWallet } from "@/lib/wallet-context";
import type { PuntMatch, PuntOutcome } from "@/app/api/punt/route";

const POLL_MS = 60_000;

type SourceTab = "txodds" | "kalshi" | "polymarket";

type ExtMarket = {
  id: string;
  title: string;
  url: string;
  price?: string | null;
  volume?: string | null;
};

interface MyPick {
  fixtureId: number;
  pick: string;
  pickLabel: string | null;
  price: number | null;
  home: string;
  away: string;
  startTime: number;
  settled: boolean;
  result: string | null;
  points: number;
}

interface LeaderRow {
  rank: number;
  wallet: string;
  points: number;
  picks: number;
  wins: number;
  settled: number;
}

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

function kickoffLabel(startTime: number): string {
  const d = new Date(startTime);
  const now = Date.now();
  const mins = Math.round((startTime - now) / 60000);
  if (mins <= 0) return "In play";
  if (mins < 60) return `in ${mins}m`;
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + ` ${time}`;
}

function OutcomeChip({
  outcome,
  best,
  pickable,
  picked,
  busy,
  onPick,
}: {
  outcome: PuntOutcome;
  best: boolean;
  pickable: boolean;
  picked: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const pct = outcome.pct;
  return (
    <button
      onClick={onPick}
      disabled={!pickable || busy}
      className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-center space-y-1 transition ${
        picked
          ? "bg-amber-500/15 border-amber-400/60 ring-1 ring-amber-400/40"
          : best
            ? "bg-green-500/10 border-green-500/30"
            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
      } ${pickable ? "cursor-pointer hover:border-amber-400/50 active:scale-[0.98]" : "cursor-default"}`}
    >
      <p className="text-xs text-gray-500 dark:text-white/50 truncate" title={outcome.name}>
        {picked ? "✓ " : ""}{outcome.name}
      </p>
      <p className="font-mono font-semibold text-gray-900 dark:text-white">
        {outcome.price ? outcome.price.toFixed(2) : "—"}
      </p>
      {pct != null && (
        <>
          <div className="h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${picked ? "bg-amber-400" : best ? "bg-green-500" : "bg-gray-400 dark:bg-white/30"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-white/30">{pct.toFixed(0)}% chance</p>
        </>
      )}
      {pickable && outcome.price && (
        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          {picked ? `${Math.round(outcome.price * 10)} pts if right` : `+${Math.round(outcome.price * 10)} pts`}
        </p>
      )}
    </button>
  );
}

function MatchCard({
  match,
  myPick,
  busy,
  onPick,
}: {
  match: PuntMatch;
  myPick: string | null;
  busy: boolean;
  onPick: (pick: string) => void;
}) {
  const bestPct = Math.max(...match.outcomes.map((o) => o.pct ?? -1));
  const pickable = !match.live && match.startTime > Date.now();
  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400 dark:text-white/30 truncate">
          {match.competition}
          {match.market && <span> · {match.market}</span>}
        </p>
        {match.live ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE{match.gameState ? ` · ${match.gameState}` : ""}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-white/30">{kickoffLabel(match.startTime)}</span>
        )}
      </div>
      <p className="font-semibold text-gray-900 dark:text-white">
        {match.home} <span className="text-gray-400 dark:text-white/30 font-normal">vs</span> {match.away}
      </p>
      {match.outcomes.length > 0 ? (
        <div className="flex gap-2">
          {match.outcomes.map((o, i) => (
            <OutcomeChip
              key={i}
              outcome={o}
              best={o.pct != null && o.pct === bestPct}
              pickable={pickable}
              picked={myPick === o.key}
              busy={busy}
              onPick={() => pickable && onPick(o.key)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-white/30">Odds not available yet</p>
      )}
    </div>
  );
}

export default function PuntPage() {
  const [matches, setMatches] = useState<PuntMatch[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [myPicks, setMyPicks] = useState<Record<number, MyPick>>({});
  const [leaders, setLeaders] = useState<LeaderRow[] | null>(null);
  const [picking, setPicking] = useState<number | null>(null);

  const { publicKey } = useWallet();

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const r = await fetch("/api/punt", { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timer);
      const j = (await r.json()) as { matches?: PuntMatch[]; updatedAt?: number; error?: string };
      if (!r.ok || !j.matches) throw new Error(j.error || `HTTP ${r.status}`);
      setMatches(j.matches);
      setUpdatedAt(j.updatedAt ?? Date.now());
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      // Leave loading: null → [] so UI shows error instead of infinite spinner
      setMatches((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadPicks = useCallback(async () => {
    if (!publicKey) { setMyPicks({}); return; }
    try {
      const r = await fetch(`/api/punt/picks?wallet=${publicKey}`, { cache: "no-store" });
      const j = (await r.json()) as { picks?: MyPick[] };
      if (j.picks) setMyPicks(Object.fromEntries(j.picks.map((p) => [p.fixtureId, p])));
    } catch {}
  }, [publicKey]);

  const loadLeaders = useCallback(async () => {
    try {
      const r = await fetch("/api/punt/leaderboard", { cache: "no-store" });
      const j = (await r.json()) as { leaderboard?: LeaderRow[] };
      if (j.leaderboard) setLeaders(j.leaderboard);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadLeaders();
    const t = setInterval(() => { load(); loadLeaders(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, loadLeaders]);

  useEffect(() => { loadPicks(); }, [loadPicks]);

  const handlePick = async (match: PuntMatch, pick: string) => {
    const { toast } = await import("@/lib/toast");
    if (!publicKey) {
      toast("Connect your wallet up top to play — it's free.");
      return;
    }
    setPicking(match.fixtureId);
    try {
      const r = await fetch("/api/punt/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, fixtureId: match.fixtureId, pick }),
      });
      const j = (await r.json()) as { ok?: boolean; points?: number; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "Pick failed");
      toast.success(`Pick locked in — ${j.points} pts if you're right!`);
      await loadPicks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that pick");
    } finally {
      setPicking(null);
    }
  };

  const [source, setSource] = useState<SourceTab>("txodds");
  const [extMarkets, setExtMarkets] = useState<ExtMarket[]>([]);
  const [extLoading, setExtLoading] = useState(false);
  const [extError, setExtError] = useState<string | null>(null);
  const [extNote, setExtNote] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (source === "txodds") return;
    let cancelled = false;
    setExtLoading(true);
    setExtError(null);
    setExtNote(null);
    setExtMarkets([]);
    (async () => {
      try {
        if (source === "polymarket") {
          const res = await fetch(
            "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40&order=volume24hr&ascending=false",
            { cache: "no-store" },
          );
          if (!res.ok) throw new Error("Could not load Polymarket");
          const data = (await res.json()) as Array<{
            id?: string;
            question?: string;
            slug?: string;
            outcomePrices?: string;
            volume24hr?: number;
            volume?: number;
          }>;
          if (cancelled) return;
          setExtMarkets(
            (Array.isArray(data) ? data : []).slice(0, 30).map((m, i) => {
              let price: string | null = null;
              try {
                const prices = JSON.parse(m.outcomePrices || "[]") as string[];
                if (prices[0]) price = `${(Number(prices[0]) * 100).toFixed(0)}¢`;
              } catch {
                /* ignore */
              }
              const vol = m.volume24hr ?? m.volume;
              return {
                id: m.id || m.slug || String(i),
                title: m.question || m.slug || "Market",
                url: m.slug
                  ? `https://polymarket.com/event/${m.slug}`
                  : "https://polymarket.com",
                price,
                volume: vol != null ? `$${Math.round(Number(vol)).toLocaleString()}` : null,
              };
            }),
          );
        } else {
          // Kalshi via same-origin proxy (CORS + rate-limit handled server-side)
          const res = await fetch(`/api/punt/kalshi?limit=40`, {
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            warning?: string;
            source?: string;
            markets?: Array<{
              id: string;
              title: string;
              url: string;
              price: string | null;
              volume: string | null;
            }>;
          };
          if (cancelled) return;
          const list = Array.isArray(data.markets) ? data.markets : [];
          if (list.length === 0) {
            throw new Error(data.error || data.warning || "Could not load Kalshi");
          }
          setExtMarkets(
            list.slice(0, 30).map((m, i) => ({
              id: m.id || String(i),
              title: m.title || "Market",
              url: m.url || "https://kalshi.com",
              price: m.price,
              volume: m.volume,
            })),
          );
          // Soft warning (rate-limit / fallback) — not a hard fail
          if (data.warning || data.source === "fallback" || data.source === "stale") {
            setExtError(null);
            setExtNote(
              data.warning ||
                (data.source === "fallback"
                  ? "Showing Kalshi browse links (live feed busy)"
                  : null),
            );
          } else {
            setExtNote(null);
          }
        }
      } catch (e) {
        if (!cancelled) setExtError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setExtLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const liveMatches = matches?.filter((m) => m.live) ?? [];
  const upcoming = matches?.filter((m) => !m.live) ?? [];
  const settledPicks = Object.values(myPicks).filter((p) => p.settled);
  const myPoints = settledPicks.reduce((s, p) => s + p.points, 0);
  const myWins = settledPicks.filter((p) => p.pick === p.result).length;

  const filteredExt = extMarkets.filter((m) =>
    !q.trim() ? true : m.title.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const sourceChip = (id: SourceTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setSource(id)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
        source === id
          ? "bg-green-600 text-white border-green-600"
          : "bg-black/5 dark:bg-white/5 text-gray-700 dark:text-white/70 border-black/10 dark:border-white/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 app-shell py-8 space-y-8">
        <PageTransition>
        <div className="text-center space-y-3">
          <AnimatedIcon icon={Trophy} size={40} className="text-green-600 dark:text-green-400" />
          <h1 className="text-3xl font-bold tracking-tight">Punt</h1>
          <p className="text-gray-500 dark:text-white/50">
            Live odds, free picks, and prediction markets. Filter by source.
          </p>
          <a
            href="https://punt.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:underline"
          >
            Open punt.fun <ExternalLink size={14} />
          </a>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {sourceChip("txodds", "TXODDS")}
          {sourceChip("polymarket", "Polymarket")}
          {sourceChip("kalshi", "Kalshi")}
        </div>

        {source === "txodds" && (
          <>
            {publicKey && settledPicks.length > 0 && (
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 flex items-center justify-center gap-6 text-sm">
                <span><span className="font-mono font-bold text-amber-600 dark:text-amber-500">{myPoints}</span> pts</span>
                <span className="text-gray-300 dark:text-white/15">·</span>
                <span><span className="font-mono font-bold">{myWins}</span>/{settledPicks.length} correct</span>
              </div>
            )}

            {!matches && !error && (
              <div className="text-center py-12">
                <Spinner size={28} className="mx-auto" />
                <p className="text-gray-400 dark:text-white/30 text-sm mt-3">Fetching the latest odds…</p>
              </div>
            )}

            {error && !matches && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm text-center">
                Couldn&apos;t load odds right now — try again in a minute.
              </div>
            )}

            {matches && matches.length === 0 && (
              <div className="text-center py-12 space-y-2">
                <p className="text-gray-500 dark:text-white/50">No matches on the board right now.</p>
                <p className="text-gray-400 dark:text-white/30 text-sm">Check back closer to kickoff.</p>
              </div>
            )}

            {liveMatches.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-white/60">Live now</h2>
                {liveMatches.map((m) => (
                  <MatchCard key={m.fixtureId} match={m} myPick={myPicks[m.fixtureId]?.pick ?? null} busy={picking === m.fixtureId} onPick={(p) => handlePick(m, p)} />
                ))}
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-white/60">
                  Coming up {publicKey ? "— tap to pick" : ""}
                </h2>
                {upcoming.map((m) => (
                  <MatchCard key={m.fixtureId} match={m} myPick={myPicks[m.fixtureId]?.pick ?? null} busy={picking === m.fixtureId} onPick={(p) => handlePick(m, p)} />
                ))}
              </section>
            )}

            {leaders && leaders.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-white/60 flex items-center gap-1.5">
                  <Medal size={14} /> Leaderboard
                </h2>
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl divide-y divide-black/5 dark:divide-white/5">
                  {leaders.map((l) => (
                    <div
                      key={l.wallet}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm ${l.wallet === publicKey ? "bg-amber-500/10" : ""}`}
                    >
                      <span className="w-6 text-gray-400 dark:text-white/30 font-mono text-xs">{l.rank}</span>
                      <span className="flex-1 font-mono text-xs">
                        {l.wallet === publicKey ? "You" : short(l.wallet)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-white/30">{l.wins}/{l.settled}</span>
                      <span className="font-mono font-semibold text-amber-600 dark:text-amber-500 w-14 text-right">{l.points}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {matches && (
              <div className="flex items-center justify-center gap-3 text-xs text-gray-400 dark:text-white/30">
                {updatedAt && <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
                <button
                  onClick={() => { load(true); loadPicks(); loadLeaders(); }}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer disabled:opacity-50"
                >
                  {refreshing ? <Spinner size={16} state="searching" /> : <RefreshCw size={11} />} Refresh
                </button>
              </div>
            )}
          </>
        )}

        {source !== "txodds" && (
          <section className="space-y-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filter ${source} markets…`}
              className="w-full px-3 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
            />
            {extLoading && (
              <div className="text-center py-10">
                <Spinner size={24} className="mx-auto" />
              </div>
            )}
            {extError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm text-center">
                {extError}. Open{" "}
                <a
                  href={source === "kalshi" ? "https://kalshi.com" : "https://polymarket.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {source}
                </a>{" "}
                directly.
              </div>
            )}
            {extNote && !extError && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 text-amber-800 dark:text-amber-200 text-xs text-center">
                {extNote}
              </div>
            )}
            {!extLoading &&
              filteredExt.map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 hover:border-green-500/40 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                      {m.title}
                    </p>
                    <ExternalLink size={14} className="shrink-0 text-gray-400 mt-0.5" />
                  </div>
                  <div className="flex gap-3 mt-1.5 text-xs text-gray-500 dark:text-white/40">
                    {m.price && <span className="font-mono text-green-700 dark:text-green-400">{m.price}</span>}
                    {m.volume && <span>vol {m.volume}</span>}
                  </div>
                </a>
              ))}
            {!extLoading && !extError && filteredExt.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No markets match that filter.</p>
            )}
          </section>
        )}

        <p className="text-center text-[11px] text-gray-400 dark:text-white/25 leading-relaxed">
          TXODDS picks are free: points only, no payouts. External markets open on their own sites.
          Information and entertainment only — not a betting service.{" "}
          <a href="https://punt.fun" target="_blank" rel="noopener noreferrer" className="underline">
            punt.fun
          </a>
        </p>
        </PageTransition>
      </main>
    </div>
  );
}
