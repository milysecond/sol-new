"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Dices,
  Loader2,
  Sparkles,
  Trophy,
  Coins,
  ListOrdered,
  Hash,
  KeyRound,
  Volume2,
  VolumeX,
  History,
  ChevronRight,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { VrfStage } from "@/components/vrf-animations";
import { useWallet } from "@/lib/wallet-context";
import { type VrfDrawMode } from "@/lib/vrf";
import { drawSfx } from "@/lib/draw-sfx";

type DrawResult = {
  id: string;
  winner: string;
  winnerIndex: number;
  entryCount: number;
  seed: string;
  verificationHash: string;
  entries: string[];
  mode?: VrfDrawMode;
  title?: string | null;
  createdAt?: string;
};

type HistoryItem = {
  id: string;
  mode: string;
  entryCount: number;
  winnerIndex: number;
  winner: string;
  title: string | null;
  createdAt: string;
};

const FREE_KEY = "sol.new.draw.freeUses";
const FREE_KEY_LEGACY = "sol.new.vrf.freeUses";
const DURATION_KEY = "sol.new.draw.durationSec";
const MUTE_KEY = "sol.new.draw.muted";
const HISTORY_KEY = "sol.new.draw.history";
const HISTORY_MAX = 40;

const DURATION_MIN = 1.5;
const DURATION_MAX = 10;
const DURATION_DEFAULT = 3;

function parseMode(raw: string | null): VrfDrawMode {
  const s = (raw || "").toLowerCase();
  if (s === "coin" || s === "flip") return "coin";
  if (s === "dice") return "dice";
  if (s === "range" || s === "numbers") return "range";
  return "list"; // wheel, list, default
}

function modeQuery(mode: VrfDrawMode): string {
  if (mode === "coin") return "coin";
  if (mode === "dice") return "dice";
  if (mode === "range") return "range";
  return "wheel";
}

const SAMPLE_NAMES = "Alice\nBob\nCarol\nDave";

const MODES: {
  id: VrfDrawMode;
  label: string;
  hint: string;
  icon: React.ElementType;
}[] = [
  { id: "list", label: "Wheel", hint: "Pick a name", icon: ListOrdered },
  { id: "range", label: "Numbers", hint: "1 to N", icon: Hash },
  { id: "coin", label: "Coin", hint: "Heads or tails", icon: Coins },
  { id: "dice", label: "Dice", hint: "Roll 1–6", icon: Dices },
];

function parseNameList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function readFreeUses(): Record<VrfDrawMode, number> {
  try {
    const raw =
      localStorage.getItem(FREE_KEY) || localStorage.getItem(FREE_KEY_LEGACY);
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

function readLocalHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushLocalHistory(item: HistoryItem) {
  try {
    const prev = readLocalHistory().filter((h) => h.id !== item.id);
    const next = [item, ...prev].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function modeLabel(mode: string): string {
  if (mode === "coin") return "Coin";
  if (mode === "dice") return "Dice";
  if (mode === "range") return "1–N";
  return "Wheel";
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso.includes("Z") || iso.includes("+") ? iso : `${iso}Z`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function DrawInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, connect, recover, loading: walletLoading, error: walletError } =
    useWallet();

  const [mode, setMode] = useState<VrfDrawMode>(() =>
    parseMode(searchParams.get("mode")),
  );
  const [text, setText] = useState(SAMPLE_NAMES);
  const [rangeEnd, setRangeEnd] = useState("10");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [username, setUsername] = useState("");
  const [freeTick, setFreeTick] = useState(0);
  const [durationSec, setDurationSec] = useState(DURATION_DEFAULT);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync mode from URL (/draw?mode=coin, aliases via /flip etc.)
  useEffect(() => {
    const next = parseMode(searchParams.get("mode"));
    setMode(next);
  }, [searchParams]);

  // Restore duration + mute + local history
  useEffect(() => {
    try {
      const d = Number(localStorage.getItem(DURATION_KEY));
      if (Number.isFinite(d) && d >= DURATION_MIN && d <= DURATION_MAX) {
        setDurationSec(d);
      }
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
      setHistory(readLocalHistory());
    } catch {
      /* ignore */
    }
  }, []);

  // Load wallet history when connected (merge with local)
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`/api/draw?wallet=${encodeURIComponent(publicKey)}&limit=40`)
      .then((r) => r.json() as Promise<{ draws?: HistoryItem[] }>)
      .then((j) => {
        if (cancelled || !Array.isArray(j.draws)) return;
        const local = readLocalHistory();
        const byId = new Map<string, HistoryItem>();
        for (const h of j.draws) {
          byId.set(h.id, {
            id: h.id,
            mode: h.mode,
            entryCount: h.entryCount,
            winnerIndex: h.winnerIndex,
            winner: h.winner,
            title: h.title ?? null,
            createdAt: h.createdAt,
          });
        }
        for (const h of local) {
          if (!byId.has(h.id)) byId.set(h.id, h);
        }
        const merged = [...byId.values()].sort((a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        );
        setHistory(merged.slice(0, HISTORY_MAX));
        try {
          localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(merged.slice(0, HISTORY_MAX)),
          );
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  useEffect(() => {
    try {
      localStorage.setItem(DURATION_KEY, String(durationSec));
    } catch {
      /* ignore */
    }
  }, [durationSec]);

  useEffect(() => {
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted]);

  // Spinning SFX loop (ticks scale with mode)
  useEffect(() => {
    if (!spinning || muted) return;
    drawSfx.unlock();
    const interval =
      mode === "coin" || mode === "dice"
        ? Math.max(70, Math.round((durationSec * 1000) / 28))
        : Math.max(55, Math.round((durationSec * 1000) / 40));
    const id = window.setInterval(() => {
      if (mode === "coin") drawSfx.coinFlip();
      else if (mode === "dice") drawSfx.diceRattle();
      else drawSfx.wheelTick();
    }, interval);
    return () => window.clearInterval(id);
  }, [spinning, muted, mode, durationSec]);

  const freeLeft = useMemo(() => {
    void freeTick;
    if (typeof window === "undefined") return true;
    return hasFreeDraw(mode);
  }, [mode, freeTick]);

  useEffect(() => {
    setNeedsConnect(false);
    setError("");
  }, [mode, publicKey]);

  const selectMode = (m: VrfDrawMode) => {
    if (busy || spinning) return;
    setMode(m);
    setResult(null);
    setError("");
    if (m === "list" && parseNameList(text).length < 2) {
      setText(SAMPLE_NAMES);
    }
    router.replace(`/draw?mode=${modeQuery(m)}`, { scroll: false });
  };

  const play = (fn: () => void) => {
    if (muted) return;
    try {
      drawSfx.unlock();
      fn();
    } catch {
      /* ignore autoplay blocks */
    }
  };

  const previewEntries = useMemo(() => {
    if (mode === "coin") return ["Heads", "Tails"];
    if (mode === "dice") return ["1", "2", "3", "4", "5", "6"];
    if (mode === "range") {
      const end = Math.min(500, Math.max(2, Math.floor(Number(rangeEnd) || 10)));
      return Array.from({ length: end }, (_, i) => String(i + 1));
    }
    return parseNameList(text);
  }, [mode, text, rangeEnd]);

  const canDraw =
    mode === "coin" ||
    mode === "dice" ||
    (mode === "range" && previewEntries.length >= 2) ||
    (mode === "list" && previewEntries.length >= 2);

  const drawBlockedReason = useMemo(() => {
    if (mode === "list" && previewEntries.length < 2) {
      return "Add at least 2 names (one per line)";
    }
    if (mode === "range" && previewEntries.length < 2) {
      return "Pick a number of at least 2";
    }
    return null;
  }, [mode, previewEntries.length]);

  const requireConnect = !publicKey && !freeLeft;

  const actionLabel =
    mode === "coin" ? "Flip coin" : mode === "dice" ? "Roll dice" : "Spin the wheel";

  const draw = async () => {
    setError("");
    if (drawBlockedReason) {
      setError(drawBlockedReason);
      return;
    }
    if (!publicKey && !hasFreeDraw(mode)) {
      setNeedsConnect(true);
      return;
    }

    setBusy(true);
    setSpinning(true);
    setResult(null);
    setNeedsConnect(false);
    play(() => {
      if (mode === "coin") drawSfx.coinFlip();
      else if (mode === "dice") drawSfx.diceRattle();
      else drawSfx.wheelTick();
    });

    // Spin phase first, then land phase (user-adjustable total)
    const totalMs = Math.round(durationSec * 1000);
    const spinPhaseMs = Math.round(totalMs * 0.52);
    const landPhaseMs = totalMs - spinPhaseMs;
    const started = Date.now();

    try {
      const body: Record<string, unknown> = {
        mode,
        title: title.trim() || undefined,
        wallet: publicKey || undefined,
      };
      if (mode === "list") {
        body.entries = parseNameList(text);
      } else if (mode === "range") {
        body.rangeEnd = Math.min(500, Math.max(2, Math.floor(Number(rangeEnd) || 10)));
      }

      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as DrawResult & {
        error?: string;
        entries?: string[];
        createdAt?: string;
        mode?: VrfDrawMode;
        title?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Draw failed");

      // Keep spinning until the API is back AND spin phase has run
      const waitSpin = Math.max(0, spinPhaseMs - (Date.now() - started));
      await new Promise((r) => setTimeout(r, waitSpin));

      if (!publicKey) {
        markFreeUsed(mode);
        setFreeTick((t) => t + 1);
      }

      const historyItem: HistoryItem = {
        id: data.id,
        mode: data.mode || mode,
        entryCount: data.entryCount,
        winnerIndex: data.winnerIndex,
        winner: data.winner,
        title: (data.title ?? title) || null,
        createdAt: data.createdAt || new Date().toISOString(),
      };
      pushLocalHistory(historyItem);
      setHistory((prev) =>
        [historyItem, ...prev.filter((h) => h.id !== historyItem.id)].slice(
          0,
          HISTORY_MAX,
        ),
      );

      // Set winner first, then stop spin so the wheel lands on the right segment
      setResult({
        id: data.id,
        winner: data.winner,
        winnerIndex: data.winnerIndex,
        entryCount: data.entryCount,
        seed: data.seed,
        verificationHash: data.verificationHash,
        entries: data.entries || previewEntries,
      });
      setSpinning(false);
      play(() => {
        drawSfx.land();
        setTimeout(() => drawSfx.win(), Math.min(220, landPhaseMs * 0.25));
      });
      await new Promise((r) => setTimeout(r, landPhaseMs));
    } catch (e) {
      setSpinning(false);
      setError(e instanceof Error ? e.message : "Draw failed");
    } finally {
      setBusy(false);
    }
  };

  // While spinning or after a result, show the locked entry list from the draw
  const stageEntries =
    result?.entries?.length
      ? result.entries
      : previewEntries.length
        ? previewEntries
        : [];

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-5 pb-safe">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-500 mb-1">
            <Dices className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fair Draw</h1>
          <p className="text-sm text-gray-500 dark:text-white/40 max-w-md mx-auto">
            1. Choose a mode · 2. Add names or options · 3. Spin. Fair random pick with a shareable
            receipt.
          </p>
          <p className="text-[11px] text-gray-400 dark:text-white/30 max-w-md mx-auto">
            Entropy prefers MagicBlock on-chain VRF when the fair-draw program is deployed; otherwise
            Solana mainnet blockhash. Receipts show which was used.
          </p>
        </header>

        {/* 1. Mode */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 px-0.5">
            1 · How do you want to pick?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMode(m.id)}
                disabled={busy || spinning}
                className={`flex flex-col items-start gap-0.5 px-3 py-3 rounded-xl border text-left transition active:scale-[0.97] disabled:opacity-50 ${
                  mode === m.id
                    ? "border-violet-400/50 bg-violet-500/10 text-violet-700 dark:text-violet-200"
                    : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-gray-600 dark:text-white/50 hover:border-violet-400/30"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <m.icon className="w-4 h-4 shrink-0" />
                  {m.label}
                </span>
                <span className="text-[11px] opacity-70 font-normal">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Inputs */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 px-0.5">
            2 ·{" "}
            {mode === "list"
              ? "Who is on the wheel?"
              : mode === "range"
                ? "What numbers?"
                : mode === "coin"
                  ? "Coin flip"
                  : "Dice roll"}
          </p>
          <div className="space-y-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4">
            {mode === "list" && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (result) setResult(null);
                  }}
                  placeholder={"Alice\nBob\nCarol\n…"}
                  rows={5}
                  disabled={busy || spinning}
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50 resize-y disabled:opacity-50"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-white/40">
                  <span>
                    {previewEntries.length}{" "}
                    {previewEntries.length === 1 ? "name" : "names"} · one per line (or commas)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setText(SAMPLE_NAMES);
                      setResult(null);
                    }}
                    disabled={busy || spinning}
                    className="text-violet-500 hover:underline disabled:opacity-40"
                  >
                    Reset sample names
                  </button>
                </div>
              </>
            )}

            {mode === "range" && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-white/60">
                  Random number from <strong>1</strong> to
                </span>
                <input
                  type="number"
                  min={2}
                  max={500}
                  value={rangeEnd}
                  onChange={(e) => {
                    setRangeEnd(e.target.value);
                    if (result) setResult(null);
                  }}
                  disabled={busy || spinning}
                  className="w-24 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2 text-sm font-mono outline-none focus:border-violet-400/50 disabled:opacity-50"
                />
                <span className="text-xs text-gray-400">
                  ({previewEntries.length} options on the wheel)
                </span>
              </div>
            )}

            {mode === "coin" && (
              <p className="text-sm text-gray-600 dark:text-white/55">
                Fair coin: <strong>Heads</strong> or <strong>Tails</strong>. No setup needed.
              </p>
            )}

            {mode === "dice" && (
              <p className="text-sm text-gray-600 dark:text-white/55">
                Standard six-sided die: lands on <strong>1–6</strong>.
              </p>
            )}
          </div>
        </div>

        {/* 3. Stage + spin */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/35 px-0.5">
            3 · {actionLabel}
          </p>
          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden">
            <VrfStage
              mode={mode === "range" ? "list" : mode}
              spinning={spinning}
              winner={result?.winner ?? null}
              winnerIndex={result?.winnerIndex ?? 0}
              entries={stageEntries}
              durationSec={durationSec}
            />
          </div>

          {!publicKey && (
            <p className="text-xs text-center text-gray-500 dark:text-white/40">
              {freeLeft
                ? "Free try for this mode (no wallet needed)"
                : "Free try used for this mode. Connect a passkey to continue."}
            </p>
          )}

          {requireConnect || needsConnect ? (
            <div className="space-y-3 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="w-4 h-4 text-violet-400" />
                Connect to keep drawing
              </div>
              <p className="text-xs text-gray-500 dark:text-white/40">
                Passkey wallet with Face ID. No seed phrase. Free for unlimited draws after connect.
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
              onClick={() => void draw()}
              disabled={busy || spinning || !canDraw}
              className="w-full touch-target flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold py-3.5 hover:opacity-90 transition disabled:opacity-50 active:scale-[0.98]"
            >
              {busy || spinning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {spinning ? "Spinning…" : "Drawing…"}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {actionLabel}
                </>
              )}
            </button>
          )}

          {drawBlockedReason && !requireConnect && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400">
              {drawBlockedReason}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>

        {result && !spinning && (
          <div className="rounded-3xl border border-amber-400/35 bg-amber-500/5 p-6 space-y-4 text-center">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 mb-1">
                {mode === "coin" || mode === "dice" ? "Result" : "Winner"}
              </p>
              <p className="text-2xl sm:text-3xl font-bold break-all">{result.winner}</p>
              {(mode === "list" || mode === "range") && (
                <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
                  Slot {result.winnerIndex + 1} of {result.entryCount}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => void draw()}
                disabled={busy || requireConnect || !canDraw}
                className="rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold px-4 py-2.5 text-sm transition active:scale-[0.98]"
              >
                {mode === "coin" ? "Flip again" : mode === "dice" ? "Roll again" : "Spin again"}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/draw/${result.id}`)}
                className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-[0.98]"
              >
                Open receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}/draw/${result.id}`,
                  );
                }}
                className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-[0.98]"
              >
                Copy link
              </button>
            </div>
          </div>
        )}

        {/* Advanced: title, duration, mute */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 dark:text-white/55 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition"
          >
            <span className="font-medium">Options</span>
            <span className="text-xs text-gray-400">
              {showAdvanced ? "Hide" : "Title · duration · sound"}
            </span>
          </button>
          {showAdvanced && (
            <div className="px-4 pb-4 space-y-3 border-t border-black/5 dark:border-white/5 pt-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title (e.g. Friday giveaway)"
                disabled={busy || spinning}
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-violet-400/50 disabled:opacity-50"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-gray-600 dark:text-white/60" htmlFor="draw-duration">
                  Spin length
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-violet-500 tabular-nums w-12 text-right">
                    {durationSec.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMuted((m) => !m);
                      if (muted) drawSfx.unlock();
                    }}
                    className="p-2 rounded-lg border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition"
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <input
                id="draw-duration"
                type="range"
                min={DURATION_MIN}
                max={DURATION_MAX}
                step={0.5}
                value={durationSec}
                disabled={busy || spinning}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full accent-violet-500 disabled:opacity-50"
              />
              <div className="flex justify-between text-[11px] text-gray-400 dark:text-white/30">
                <span>Quick</span>
                <span>Dramatic</span>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-white/70 flex items-center gap-1.5">
              <History className="w-4 h-4 text-violet-400" />
              Recent results
            </h2>
            {historyLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-white/40 rounded-xl border border-black/5 dark:border-white/5 px-3 py-4 text-center">
              Your results show up here after you spin, flip, or roll.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/draw/${h.id}`)}
                    className="w-full flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] hover:border-violet-400/30 px-3 py-2.5 text-left transition active:scale-[0.99]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                      {h.mode === "coin" ? (
                        <Coins className="w-4 h-4" />
                      ) : h.mode === "dice" ? (
                        <Dices className="w-4 h-4" />
                      ) : (
                        <ListOrdered className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{h.winner}</div>
                      <div className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                        {modeLabel(h.mode)}
                        {h.title ? ` · ${h.title}` : ""}
                        {" · "}
                        {formatWhen(h.createdAt)}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default function DrawPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-white dark:bg-black flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <DrawInner />
    </Suspense>
  );
}
