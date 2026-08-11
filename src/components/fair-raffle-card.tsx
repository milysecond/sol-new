"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Sparkles, Users, ExternalLink, Check } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { ConnectGate } from "@/components/connect-gate";
import { toast } from "@/lib/toast";
import { playSfx } from "@/lib/sfx";

type RaffleStatus = {
  ok?: boolean;
  raffle?: {
    id: string;
    title: string;
    status: string;
    prize: {
      mint: string;
      symbol: string;
      amountUi: string;
      label: string;
    };
    minEntries: number;
    maxEntries: number;
    winnerWallet: string | null;
    drawId: string | null;
    addressUrl: string;
  };
  entryCount?: number;
  entered?: boolean;
  entries?: { wallet: string; createdAt: string }[];
  canDraw?: boolean;
};

function short(w: string) {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export function FairRaffleCard() {
  const { publicKey } = useWallet();
  const [data, setData] = useState<RaffleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const res = await fetch(`/api/draw/raffle${q}`, { cache: "no-store" });
      const j = (await res.json()) as RaffleStatus;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load raffle");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const register = async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draw/raffle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", wallet: publicKey }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        already?: boolean;
        registered?: boolean;
      };
      if (!res.ok) throw new Error(j.error || "Register failed");
      if (j.already) toast.info("Already in the draw");
      else {
        toast.success("You're in — good luck!");
        try {
          playSfx("success");
        } catch {
          /* ignore */
        }
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register failed");
      try {
        playSfx("error");
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  const runDraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draw/raffle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draw" }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        winner?: string;
        drawId?: string;
        receiptUrl?: string;
      };
      if (!res.ok) throw new Error(j.error || "Draw failed");
      toast.money(`Winner: ${short(j.winner || "")}`);
      try {
        playSfx("money");
      } catch {
        /* ignore */
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draw failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 flex items-center justify-center gap-2 text-sm text-gray-500">
        <Spinner size={18} /> Loading raffle…
      </div>
    );
  }

  const r = data?.raffle;
  if (!r) return null;

  const open = r.status === "open";
  const drawn = r.status === "drawn";

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-violet-500/5 to-transparent p-5 sm:p-6 space-y-4 ring-1 ring-amber-500/10">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Fair Draw · New
          </p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {r.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed max-w-lg">
            Connect your wallet and register once. When we draw, a provably fair
            VRF pick chooses one winner for the prize.
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-amber-500/15 border border-amber-500/25 px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
            Prize
          </p>
          <p className="text-lg font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {Number(r.prize.amountUi).toLocaleString()}
          </p>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            ${r.prize.symbol}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 font-medium">
          <Users className="w-3.5 h-3.5" />
          {data?.entryCount ?? 0} registered
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
            open
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
              : "bg-violet-500/15 text-violet-600 dark:text-violet-300"
          }`}
        >
          {open ? "Open" : drawn ? "Drawn" : r.status}
        </span>
        <Link
          href={`/address/${r.prize.mint}`}
          className="inline-flex items-center gap-1 text-violet-500 hover:underline font-medium"
        >
          Prize mint <ExternalLink className="w-3 h-3" />
        </Link>
        {r.drawId && (
          <Link
            href={`/draw/${r.drawId}`}
            className="inline-flex items-center gap-1 text-violet-500 hover:underline font-medium"
          >
            Receipt <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      {drawn && r.winnerWallet && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
          <Trophy className="w-6 h-6 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
              Winner
            </p>
            <p className="font-mono text-sm font-semibold break-all text-gray-900 dark:text-white">
              {r.winnerWallet}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Prize: {r.prize.label} · claim arranged off-draw (on-chain transfer
              separately)
            </p>
          </div>
        </div>
      )}

      {open && (
        <ConnectGate action="enter the fair draw">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busy || data?.entered}
              onClick={() => void register()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {busy ? (
                <Spinner size={18} />
              ) : data?.entered ? (
                <Check className="w-4 h-4" />
              ) : (
                <Trophy className="w-4 h-4" />
              )}
              {data?.entered ? "You're registered" : "Register with wallet"}
            </button>
            {data?.canDraw && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDraw()}
                className="sm:w-auto px-4 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-100 font-semibold py-3.5 transition cursor-pointer"
              >
                Draw winner
              </button>
            )}
          </div>
        </ConnectGate>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {(data?.entries?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Recent entries
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {data!.entries!.map((e) => (
              <Link
                key={e.wallet}
                href={`/address/${e.wallet}`}
                className={`font-mono text-[11px] rounded-lg px-2 py-1 border transition ${
                  publicKey === e.wallet
                    ? "border-violet-400/50 bg-violet-500/15 text-violet-700 dark:text-violet-200"
                    : "border-black/10 dark:border-white/10 text-gray-500 hover:border-violet-400/30"
                }`}
              >
                {short(e.wallet)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
