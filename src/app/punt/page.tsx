"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { Trophy, RefreshCw, Medal } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import type { PuntMatch, PuntOutcome } from "@/app/api/punt/route";

const POLL_MS = 60_000;

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
      const r = await fetch("/api/punt", { cache: "no-store" });
      const j = (await r.json()) as { matches?: PuntMatch[]; updatedAt?: number; error?: string };
      if (!r.ok || !j.matches) throw new Error(j.error || `HTTP ${r.status}`);
      setMatches(j.matches);
      setUpdatedAt(j.updatedAt ?? Date.now());
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
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
    const { toast } = await import("sonner");
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

  const liveMatches = matches?.filter((m) => m.live) ?? [];
  const upcoming = matches?.filter((m) => !m.live) ?? [];
  const settledPicks = Object.values(myPicks).filter((p) => p.settled);
  const myPoints = settledPicks.reduce((s, p) => s + p.points, 0);
  const myWins = settledPicks.filter((p) => p.pick === p.result).length;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div className="text-center space-y-3">
          <AnimatedIcon icon={Trophy} size={40} className="text-green-400" />
          <h1 className="text-3xl font-bold tracking-tight">World Cup odds, live</h1>
          <p className="text-gray-500 dark:text-white/50">
            Fair, de-margined odds from the TXODDS oracle — and a free picks game.
            Tap a team before kickoff. Bolder picks, more points.
          </p>
        </div>

        {publicKey && settledPicks.length > 0 && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 flex items-center justify-center gap-6 text-sm">
            <span><span className="font-mono font-bold text-amber-500">{myPoints}</span> pts</span>
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
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm text-center">
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
            <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60">Live now</h2>
            {liveMatches.map((m) => (
              <MatchCard key={m.fixtureId} match={m} myPick={myPicks[m.fixtureId]?.pick ?? null} busy={picking === m.fixtureId} onPick={(p) => handlePick(m, p)} />
            ))}
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60">
              Coming up {publicKey ? "— tap to pick" : ""}
            </h2>
            {upcoming.map((m) => (
              <MatchCard key={m.fixtureId} match={m} myPick={myPicks[m.fixtureId]?.pick ?? null} busy={picking === m.fixtureId} onPick={(p) => handlePick(m, p)} />
            ))}
          </section>
        )}

        {leaders && leaders.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60 flex items-center gap-1.5">
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
                  <span className="font-mono font-semibold text-amber-500 w-14 text-right">{l.points}</span>
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
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 dark:text-white/25 leading-relaxed">
          Odds by TXODDS TxLINE — cryptographically anchored on Solana. Percentages are de-margined
          implied probabilities. The picks game is free to play: no stakes, no payouts, just points and glory.
          This is information and entertainment, not a betting service.
        </p>
      </main>
    </div>
  );
}
