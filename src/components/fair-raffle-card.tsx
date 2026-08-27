"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Sparkles,
  Users,
  ExternalLink,
  Check,
  Plus,
  Clock,
  Ban,
  Timer,
} from "lucide-react";
import { Transaction } from "@solana/web3.js";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { ConnectGate } from "@/components/connect-gate";
import { toast } from "@/lib/toast";
import { playSfx } from "@/lib/sfx";
import {
  ensureDocumentFocusForPasskey,
  getPasskeyKeypair,
} from "@/lib/passkey-wallet";
import { Connection } from "@solana/web3.js";
import { useNetwork } from "@/lib/network";

type Raffle = {
  id: string;
  slug: string;
  title: string;
  status: string;
  creatorWallet?: string | null;
  prize: {
    mint: string;
    symbol: string;
    amountUi: string;
    label: string;
  };
  minEntries: number;
  closesAt?: string | null;
  winnerWallet?: string | null;
  drawId?: string | null;
  payoutSig?: string | null;
  entryCount?: number;
  entered?: boolean;
  canDraw?: boolean;
};

function short(w: string) {
  return w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

function fmtClose(closesAt?: string | null) {
  if (!closesAt) return "No auto end";
  const ms = Date.parse(closesAt.replace(" ", "T") + "Z");
  if (!Number.isFinite(ms)) return closesAt;
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FairRaffleCard() {
  const { publicKey } = useWallet();
  const { rpc } = useNetwork();
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("My fair raffle");
  const [mint, setMint] = useState(
    "fEbiuDdZZ1QaWYpJFPqk23ZkaRnAyHg4aivhrCTshit",
  );
  const [amount, setAmount] = useState("1000000");
  const [symbol, setSymbol] = useState("TOKENSHIT");
  const [durationMin, setDurationMin] = useState(60);

  const load = useCallback(async () => {
    try {
      const q = publicKey
        ? `?list=1&wallet=${encodeURIComponent(publicKey)}`
        : "?list=1";
      const res = await fetch(`/api/draw/raffle${q}`, { cache: "no-store" });
      const j = (await res.json()) as { raffles?: Raffle[]; error?: string };
      if (!res.ok) throw new Error(j.error || "Load failed");
      setRaffles(j.raffles || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/draw/raffle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(j.error || "Request failed");
    return j;
  };

  const createRaffle = async () => {
    if (!publicKey) return;
    setBusy("create");
    setError(null);
    try {
      const created = await post({
        action: "create",
        wallet: publicKey,
        title,
        prizeMint: mint.trim(),
        prizeAmount: amount.trim(),
        prizeSymbol: symbol.trim(),
        durationMinutes: durationMin,
      });

      const txB64 = String(created.depositTxBase64 || "");
      if (!txB64) throw new Error("No deposit transaction");

      await ensureDocumentFocusForPasskey();
      const connection = new Connection(rpc, "confirmed");
      const tx = Transaction.from(Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0)));
      const { keypair } = await getPasskeyKeypair(publicKey);
      tx.sign(keypair);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(signature, "confirmed");

      await post({
        action: "fund",
        raffleId: created.raffleId,
        wallet: publicKey,
        depositSig: signature,
      });

      toast.success("Raffle funded and open!");
      playSfx("success");
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      playSfx("error");
    } finally {
      setBusy(null);
    }
  };

  const register = async (r: Raffle) => {
    if (!publicKey) return;
    setBusy(r.id);
    setError(null);
    try {
      const j = await post({
        action: "register",
        wallet: publicKey,
        raffleId: r.id,
      });
      if (j.already) toast.info("Already entered");
      else {
        toast.success("You're in!");
        playSfx("success");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register failed");
      playSfx("error");
    } finally {
      setBusy(null);
    }
  };

  const delay = async (r: Raffle, mins: number) => {
    if (!publicKey) return;
    setBusy(r.id + "d");
    try {
      await post({
        action: "delay",
        raffleId: r.id,
        wallet: publicKey,
        addMinutes: mins,
      });
      toast.success(`Delayed +${mins}m`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delay failed");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (r: Raffle) => {
    if (!publicKey) return;
    if (!confirm("Cancel raffle and refund prize to you?")) return;
    setBusy(r.id + "c");
    try {
      const j = await post({
        action: "cancel",
        raffleId: r.id,
        wallet: publicKey,
      });
      toast.success(
        j.refundSig ? "Cancelled — prize refunded" : "Cancelled",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading && raffles.length === 0) {
    return (
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 flex items-center justify-center gap-2 text-sm text-gray-500">
        <Spinner size={18} /> Loading raffles…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Fair raffles
          </p>
          <p className="text-sm text-gray-500 dark:text-white/50">
            Create a prize raffle · auto draw at end · prize paid on-chain
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-3 py-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            New raffle
          </p>
          <label className="block text-xs space-y-1">
            <span className="text-gray-500">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs space-y-1">
            <span className="text-gray-500">Prize mint (CA)</span>
            <input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm font-mono"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs space-y-1">
              <span className="text-gray-500">Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-gray-500">Symbol</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs space-y-1">
            <span className="text-gray-500">
              Run time (minutes) — auto draw + payout
            </span>
            <input
              type="number"
              min={5}
              max={43200}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 60)}
              className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm"
            />
          </label>
          <p className="text-[11px] text-gray-500">
            You deposit the prize into escrow when creating. At end time we
            pick a winner and send the tokens automatically. You can delay or
            cancel (refund) while open.
          </p>
          <ConnectGate action="create a raffle">
            <button
              type="button"
              disabled={busy === "create"}
              onClick={() => void createRaffle()}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold py-3 disabled:opacity-50 cursor-pointer"
            >
              {busy === "create" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} /> Funding escrow…
                </span>
              ) : (
                "Create & fund prize"
              )}
            </button>
          </ConnectGate>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {raffles.map((r) => {
          const isCreator = publicKey && r.creatorWallet === publicKey;
          const open = r.status === "open";
          const drawn = r.status === "drawn";
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-violet-500/5 to-transparent p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <h3 className="font-bold text-gray-900 dark:text-white truncate">
                    {r.title}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2 py-0.5">
                      <Users className="w-3 h-3" />
                      {r.entryCount ?? 0}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        open
                          ? "bg-emerald-500/15 text-emerald-600"
                          : drawn
                            ? "bg-violet-500/15 text-violet-600"
                            : "bg-gray-500/15 text-gray-500"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.closesAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2 py-0.5">
                        <Clock className="w-3 h-3" />
                        {fmtClose(r.closesAt)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums">
                    {Number(r.prize.amountUi).toLocaleString()}
                  </p>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    ${r.prize.symbol}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <Link
                  href={`/address/${r.prize.mint}`}
                  className="text-violet-500 hover:underline inline-flex items-center gap-1"
                >
                  Prize CA <ExternalLink className="w-3 h-3" />
                </Link>
                {r.drawId && (
                  <Link
                    href={`/draw/${r.drawId}`}
                    className="text-violet-500 hover:underline"
                  >
                    Receipt
                  </Link>
                )}
                {r.payoutSig && (
                  <a
                    href={`/receipt/${r.payoutSig}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-500 hover:underline"
                  >
                    Payout tx
                  </a>
                )}
              </div>

              {drawn && r.winnerWallet && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase font-semibold text-emerald-600">
                      Winner
                    </p>
                    <p className="font-mono text-xs break-all">{r.winnerWallet}</p>
                  </div>
                </div>
              )}

              {open && (
                <ConnectGate action="enter this raffle">
                  <button
                    type="button"
                    disabled={!!busy || r.entered}
                    onClick={() => void register(r)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 cursor-pointer"
                  >
                    {busy === r.id ? (
                      <Spinner size={16} />
                    ) : r.entered ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Trophy className="w-4 h-4" />
                    )}
                    {r.entered ? "Registered" : "Register with wallet"}
                  </button>
                </ConnectGate>
              )}

              {isCreator && open && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void delay(r, 30)}
                    className="inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Timer className="w-3.5 h-3.5" /> +30m
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void delay(r, 60 * 24)}
                    className="inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Timer className="w-3.5 h-3.5" /> +1d
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void cancel(r)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 text-red-500 px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-red-500/10"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel & refund
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
