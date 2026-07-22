"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dices,
  Loader2,
  Sparkles,
  Trophy,
  Coins,
  ListOrdered,
  Hash,
  KeyRound,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { VrfStage } from "@/components/vrf-animations";
import { useWallet } from "@/lib/wallet-context";
import { type VrfDrawMode } from "@/lib/vrf";

type DrawResult = {
  id: string;
  winner: string;
  winnerIndex: number;
  entryCount: number;
  seed: string;
  verificationHash: string;
  entries: string[];
};

const FREE_KEY = "sol.new.vrf.freeUses";

const MODES: { id: VrfDrawMode; label: string; icon: React.ElementType }[] = [
  { id: "list", label: "Wheel", icon: ListOrdered },
  { id: "range", label: "1–N", icon: Hash },
  { id: "coin", label: "Coin", icon: Coins },
  { id: "dice", label: "Dice", icon: Dices },
];

function readFreeUses(): Record<VrfDrawMode, number> {
  try {
    const raw = localStorage.getItem(FREE_KEY);
    if (!raw) return { list: 0, range: 0, coin: 0, dice: 0 };
    const j = JSON.parse(raw) as Partial<Record<VrfDrawMode, number>>;
    return {
      list: Number(j.list) || 0,
      range: Number(j.range) || 0,
      coin: Number(j.coin) || 0,
      dice: Number(j.dice) || 0,
    };
  } catch {
    return { list: 0, range: 0, coin: 0, dice: 0 };
  }
}

function markFreeUsed(mode: VrfDrawMode) {
  const uses = readFreeUses();
  uses[mode] = (uses[mode] || 0) + 1;
  localStorage.setItem(FREE_KEY, JSON.stringify(uses));
}

function hasFreeDraw(mode: VrfDrawMode): boolean {
  return (readFreeUses()[mode] || 0) < 1;
}

export default function VrfPage() {
  const router = useRouter();
  const { publicKey, connect, recover, loading: walletLoading, error: walletError } =
    useWallet();

  const [mode, setMode] = useState<VrfDrawMode>("list");
  const [text, setText] = useState("");
  const [rangeEnd, setRangeEnd] = useState("10");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [username, setUsername] = useState("");
  const [freeTick, setFreeTick] = useState(0);

  const freeLeft = useMemo(() => {
    void freeTick;
    if (typeof window === "undefined") return true;
    return hasFreeDraw(mode);
  }, [mode, freeTick]);

  useEffect(() => {
    setNeedsConnect(false);
    setError("");
  }, [mode, publicKey]);

  const previewEntries = useMemo(() => {
    if (mode === "coin") return ["Heads", "Tails"];
    if (mode === "dice") return ["1", "2", "3", "4", "5", "6"];
    if (mode === "range") {
      const end = Math.min(500, Math.max(2, Math.floor(Number(rangeEnd) || 10)));
      return Array.from({ length: end }, (_, i) => String(i + 1));
    }
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [mode, text, rangeEnd]);

  const requireConnect = !publicKey && !freeLeft;

  const draw = async () => {
    setError("");
    if (!publicKey && !hasFreeDraw(mode)) {
      setNeedsConnect(true);
      return;
    }

    setBusy(true);
    setSpinning(true);
    setResult(null);
    setNeedsConnect(false);

    // Let animation play while request runs
    const minSpin = mode === "coin" || mode === "dice" ? 1800 : 2800;
    const started = Date.now();

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
      const data = (await res.json()) as DrawResult & { error?: string; entries?: string[] };
      if (!res.ok) throw new Error(data.error || "Draw failed");

      const wait = Math.max(0, minSpin - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));

      if (!publicKey) {
        markFreeUsed(mode);
        setFreeTick((t) => t + 1);
      }

      setSpinning(false);
      setResult({
        id: data.id,
        winner: data.winner,
        winnerIndex: data.winnerIndex,
        entryCount: data.entryCount,
        seed: data.seed,
        verificationHash: data.verificationHash,
        entries: data.entries || previewEntries,
      });
    } catch (e) {
      setSpinning(false);
      setError(e instanceof Error ? e.message : "Draw failed");
    } finally {
      setBusy(false);
    }
  };

  const stageEntries = result?.entries?.length
    ? result.entries
    : previewEntries.length
      ? previewEntries
      : ["A", "B", "C", "D", "E", "F"];

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6 pb-safe">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-500 mb-1">
            <Dices className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fair Draw</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-white/40 max-w-md mx-auto">
            Spin the wheel, flip a coin, or roll the dice. One free try of each. Then connect to keep going.
          </p>
        </header>

        {/* Mode picker */}
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (busy || spinning) return;
                setMode(m.id);
                setResult(null);
              }}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition active:scale-[0.97] ${
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

        {/* Animation stage */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden">
          <VrfStage
            mode={mode === "range" ? "list" : mode}
            spinning={spinning}
            winner={result?.winner ?? null}
            winnerIndex={result?.winnerIndex ?? 0}
            entries={stageEntries}
          />
        </div>

        {/* Controls */}
        <div className="space-y-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title (e.g. Friday giveaway)"
            disabled={busy}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50 disabled:opacity-50"
          />

          {mode === "list" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"alice\nbob\ncarol\n…\nor comma-separated"}
              rows={5}
              disabled={busy}
              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm font-mono outline-none focus:border-violet-400/50 resize-y disabled:opacity-50"
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
                disabled={busy}
                className="w-24 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2 text-sm font-mono outline-none focus:border-violet-400/50 disabled:opacity-50"
              />
            </div>
          )}

          {!publicKey && (
            <p className="text-xs text-gray-500 dark:text-white/40">
              {freeLeft
                ? "1 free draw left for this mode"
                : "Free draw used for this mode. Connect to continue."}
            </p>
          )}

          {requireConnect || needsConnect ? (
            <div className="space-y-3 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="w-4 h-4 text-violet-400" />
                Connect to keep drawing
              </div>
              <p className="text-xs text-gray-500 dark:text-white/40">
                Passkey wallet with Face ID. No seed phrase.
              </p>
              <input
                type="text"
                placeholder="Wallet label (e.g. My Main Wallet)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50"
              />
              {walletError && (
                <div className="text-sm text-rose-500">{walletError}</div>
              )}
              <button
                type="button"
                onClick={() => username.trim() && connect(username.trim())}
                disabled={walletLoading || !username.trim()}
                className="w-full touch-target rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold py-3 transition active:scale-[0.98]"
              >
                {walletLoading ? (
                  <>
                    <Spinner size={16} className="inline mr-2" /> Connecting…
                  </>
                ) : (
                  "Connect wallet"
                )}
              </button>
              <button
                type="button"
                onClick={() => recover()}
                disabled={walletLoading}
                className="w-full rounded-xl border border-black/10 dark:border-white/10 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                I already have a passkey wallet
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={draw}
              disabled={busy || spinning}
              className="w-full touch-target flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold py-3 hover:opacity-90 transition disabled:opacity-60 active:scale-[0.98]"
            >
              {busy || spinning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Drawing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {mode === "coin"
                    ? "Flip coin"
                    : mode === "dice"
                      ? "Roll dice"
                      : "Spin"}
                </>
              )}
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>

        {result && !spinning && (
          <div className="rounded-3xl border border-violet-400/30 bg-violet-500/5 p-6 space-y-4 text-center animate-[fadeIn_300ms_ease-out]">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 mb-1">
                Winner
              </p>
              <p className="text-2xl sm:text-3xl font-bold break-all">{result.winner}</p>
              <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
                #{result.winnerIndex + 1} of {result.entryCount}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => router.push(`/vrf/${result.id}`)}
                className="rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-semibold px-4 py-2.5 text-sm transition active:scale-[0.98]"
              >
                Open receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/vrf/${result.id}`,
                  );
                }}
                className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-[0.98]"
              >
                Copy link
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
