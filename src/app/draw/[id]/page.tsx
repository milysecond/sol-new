"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Copy,
  Dices,
  Loader2,
  Trophy,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { type VrfDrawRecord } from "@/lib/vrf";

export default function VrfReceiptPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [draw, setDraw] = useState<VrfDrawRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/draw/${id}`)
      .then(async (r) => {
        const j = (await r.json()) as VrfDrawRecord & { error?: string };
        if (!r.ok) throw new Error(j.error || "Not found");
        if (!cancelled) setDraw(j);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <div className="print:hidden">
        <Navbar />
      </div>
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 space-y-4 pb-safe">
        <div className="flex items-center justify-between print:hidden">
          <Link
            href="/draw"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-500 hover:text-violet-400"
          >
            <Dices className="w-4 h-4" /> Fair Draw
          </Link>
        </div>

        {loading && (
          <div className="rounded-3xl border border-black/10 dark:border-white/10 p-10 text-center">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading draw…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <Link href="/draw" className="text-sm text-violet-500 hover:underline">
              New draw
            </Link>
          </div>
        )}

        {!loading && draw && (
          <div className="rounded-3xl border border-black/10 dark:border-white/10 overflow-hidden bg-black/[0.02] dark:bg-white/[0.03]">
            <div className="p-5 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-b border-black/5 dark:border-white/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {draw.title || "Fair draw"}
                  </p>
                  <h1 className="text-lg font-bold mt-0.5">Draw receipt</h1>
                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1 font-mono">
                    {draw.id}
                  </p>
                </div>
                <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-center py-2">
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 mb-1">
                  Winner
                </p>
                <p className="text-2xl font-bold break-all">{draw.winner}</p>
                <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
                  Index {draw.winnerIndex} · {draw.entryCount} entries
                </p>
              </div>

              <dl className="space-y-2 text-sm">
                <Row
                  label="Entropy"
                  value={
                    draw.provider === "magicblock"
                      ? "MagicBlock VRF (on-chain)"
                      : draw.provider === "proofnetwork"
                        ? "ProofNetwork VRF"
                        : "Solana blockhash"
                  }
                />
                <Row label="Entries hash" value={short(draw.entriesHash)} mono copy={draw.entriesHash} />
                <Row label="Seed" value={short(draw.seed)} mono copy={draw.seed} />
                <Row
                  label="Verification"
                  value={short(draw.verificationHash)}
                  mono
                  copy={draw.verificationHash}
                />
                {draw.slot != null && (
                  <Row label="Slot" value={String(draw.slot)} mono />
                )}
                {draw.blockhash && (
                  <Row
                    label={draw.provider === "magicblock" ? "Request tx" : "Blockhash"}
                    value={short(draw.blockhash)}
                    mono
                    copy={draw.blockhash}
                  />
                )}
                {draw.createdAt && (
                  <Row
                    label="Time"
                    value={new Date(
                      String(draw.createdAt) +
                        (String(draw.createdAt).includes("Z") ? "" : "Z"),
                    ).toLocaleString()}
                  />
                )}
              </dl>

              {draw.entries?.length > 0 && draw.entries.length <= 50 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 mb-2">
                    Entries
                  </p>
                  <ol className="text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto">
                    {draw.entries.map((e, i) => (
                      <li
                        key={`${i}-${e}`}
                        className={`px-2 py-1 rounded ${
                          i === draw.winnerIndex
                            ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold"
                            : "text-gray-600 dark:text-white/50"
                        }`}
                      >
                        {i + 1}. {e}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="print:hidden flex flex-col gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-semibold py-2.5 text-sm transition active:scale-[0.98]"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy receipt link"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl border border-black/10 dark:border-white/10 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition"
                >
                  Print
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function short(s: string, n = 10) {
  if (!s || s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function Row({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
}) {
  return (
    <div className="flex justify-between gap-3 items-start border-b border-black/5 dark:border-white/5 pb-2 last:border-0">
      <dt className="text-gray-500 dark:text-white/40 shrink-0">{label}</dt>
      <dd className="text-right min-w-0 flex items-center gap-1 justify-end">
        <span className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
        {copy && (
          <button
            type="button"
            className="print:hidden p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white"
            onClick={() => navigator.clipboard.writeText(copy)}
            aria-label={`Copy ${label}`}
          >
            <Copy className="w-3 h-3" />
          </button>
        )}
      </dd>
    </div>
  );
}
