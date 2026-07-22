"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dices,
  ExternalLink,
  Loader2,
  Sparkles,
  Trophy,
  Coins,
  ListOrdered,
  Hash,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { MAGICBLOCK, PROOFNETWORK, type VrfDrawMode } from "@/lib/vrf";
import type { ProofNetworkVrfRequest } from "@/lib/proofnetwork";

type DrawResult = {
  id: string;
  winner: string;
  winnerIndex: number;
  entryCount: number;
  provider: string;
  seed: string;
  verificationHash: string;
  slot: number | null;
  blockhash: string | null;
};

const MODES: { id: VrfDrawMode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "list", label: "List", icon: ListOrdered, hint: "Paste names or wallets" },
  { id: "range", label: "1–N", icon: Hash, hint: "Sequential numbers" },
  { id: "coin", label: "Coin", icon: Coins, hint: "Heads or tails" },
  { id: "dice", label: "Dice", icon: Dices, hint: "d6" },
];

export default function VrfPage() {
  const router = useRouter();
  const [mode, setMode] = useState<VrfDrawMode>("list");
  const [text, setText] = useState("");
  const [rangeEnd, setRangeEnd] = useState("10");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [feed, setFeed] = useState<ProofNetworkVrfRequest[]>([]);

  useEffect(() => {
    fetch("/api/vrf/feed")
      .then((r) => r.json() as Promise<{ requests?: ProofNetworkVrfRequest[] }>)
      .then((j) => {
        if (Array.isArray(j.requests)) setFeed(j.requests.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  const draw = async () => {
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { mode, title: title || undefined };
      if (mode === "list") {
        body.entries = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      } else if (mode === "range") {
        body.rangeEnd = Number(rangeEnd);
      }

      const res = await fetch("/api/vrf/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as DrawResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Draw failed");
      setResult({
        id: data.id,
        winner: data.winner,
        winnerIndex: data.winnerIndex,
        entryCount: data.entryCount,
        provider: data.provider,
        seed: data.seed,
        verificationHash: data.verificationHash,
        slot: data.slot,
        blockhash: data.blockhash,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draw failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-8 pb-safe">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-500 mb-1">
            <Dices className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fair Draw</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-white/40 max-w-md mx-auto">
            Provably fair raffles and random picks. Entropy from Solana by default;
            ProofNetwork when configured; MagicBlock on-chain VRF next.
          </p>
        </header>

        {/* Mode picker */}
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition ${
                mode === m.id
                  ? "border-violet-400/50 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-gray-600 dark:text-white/50 hover:border-violet-400/30"
              }`}
            >
              <m.icon className="w-4 h-4" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title (e.g. Friday giveaway)"
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50"
          />

          {mode === "list" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"alice\nbob\ncarol\n…\nor comma-separated"}
              rows={6}
              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm font-mono outline-none focus:border-violet-400/50 resize-y"
            />
          )}

          {mode === "range" && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Numbers 1 through</span>
              <input
                type="number"
                min={2}
                max={500}
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-24 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2 text-sm font-mono outline-none focus:border-violet-400/50"
              />
            </div>
          )}

          {(mode === "coin" || mode === "dice") && (
            <p className="text-sm text-gray-500 dark:text-white/40">
              {mode === "coin" ? "Flip: Heads or Tails." : "Roll a fair six-sided die."}
            </p>
          )}

          <button
            type="button"
            onClick={draw}
            disabled={busy}
            className="w-full touch-target flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold py-3 hover:opacity-90 transition disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Drawing…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Draw winner
              </>
            )}
          </button>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="rounded-3xl border border-violet-400/30 bg-violet-500/5 p-6 space-y-4 text-center">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 mb-1">
                Winner
              </p>
              <p className="text-2xl sm:text-3xl font-bold break-all">{result.winner}</p>
              <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
                #{result.winnerIndex + 1} of {result.entryCount} · {result.provider}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => router.push(`/vrf/${result.id}`)}
                className="rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-semibold px-4 py-2.5 text-sm transition"
              >
                Open receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/vrf/${result.id}`);
                }}
                className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Copy link
              </button>
            </div>
          </div>
        )}

        {/* MagicBlock + ProofNetwork info */}
        <section className="grid sm:grid-cols-2 gap-3 text-sm">
          <a
            href={PROOFNETWORK.vrfExplorer}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-black/10 dark:border-white/10 p-4 hover:border-violet-400/30 transition space-y-1"
          >
            <div className="font-semibold flex items-center gap-1">
              ProofNetwork <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40">
              Instant VRF for JS apps. Live network feed below. Configure API env for draws via their runtime.
            </p>
          </a>
          <a
            href={MAGICBLOCK.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-black/10 dark:border-white/10 p-4 hover:border-violet-400/30 transition space-y-1"
          >
            <div className="font-semibold flex items-center gap-1">
              MagicBlock Solana VRF <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40">
              On-chain oracle proof network. Program{" "}
              <span className="font-mono text-[10px]">{MAGICBLOCK.vrfProgramId.slice(0, 8)}…</span>
            </p>
          </a>
        </section>

        {feed.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-white/50">
              Live ProofNetwork VRF
            </h2>
            <ul className="space-y-1.5">
              {feed.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-xs rounded-lg border border-black/5 dark:border-white/5 px-3 py-2"
                >
                  <span className="text-gray-500 dark:text-white/40 truncate">
                    {r.type}
                    {r.data?.start != null && r.data?.end != null
                      ? ` ${r.data.start}–${r.data.end}`
                      : ""}{" "}
                    → <span className="text-gray-900 dark:text-white font-mono">{String(r.result)}</span>
                  </span>
                  <span className="text-gray-400 dark:text-white/30 shrink-0 font-mono">
                    #{r.id}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={PROOFNETWORK.vrfExplorer}
              className="text-xs text-violet-500 hover:underline"
              target="_blank"
            >
              Open explorer →
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
