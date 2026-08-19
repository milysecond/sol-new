"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ExternalLink,
  Clock,
} from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";
import { txPath } from "@/lib/explorer";

type TxRow = {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus: string | null;
};

function shortSig(s: string) {
  return s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-8)}` : s;
}

function fmtWhen(ts: number | null) {
  if (ts == null) return "—";
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Solana Explorer–style transaction list for an address / mint / program.
 */
export function AddressTxHistory({
  address,
  title = "Transactions",
  compact,
}: {
  address: string;
  title?: string;
  compact?: boolean;
}) {
  const { network } = useNetwork();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { before?: string; append?: boolean }) => {
      const append = !!opts?.append;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const qs = new URLSearchParams({
          address,
          limit: compact ? "15" : "40",
          network: network === "devnet" ? "devnet" : "mainnet",
        });
        if (opts?.before) qs.set("before", opts.before);
        const r = await fetch(`/api/explorer/txs?${qs}`, { cache: "no-store" });
        const j = (await r.json()) as {
          ok?: boolean;
          error?: string;
          transactions?: TxRow[];
          hasMore?: boolean;
          nextBefore?: string | null;
        };
        if (!r.ok || j.ok === false) {
          throw new Error(j.error || "Failed to load transactions");
        }
        const list = j.transactions || [];
        setRows((prev) => (append ? [...prev, ...list] : list));
        setHasMore(!!j.hasMore);
        setNextBefore(j.nextBefore ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) setRows([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [address, network, compact],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-rose-500" />
          {title}
          {!loading && rows.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              ({rows.length}
              {hasMore ? "+" : ""})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[11px] text-gray-500 hover:text-rose-500 transition"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
          <Spinner size={16} /> Loading transactions…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">
          No transactions found for this address
        </p>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden divide-y divide-black/5 dark:divide-white/5">
          {/* header */}
          <div className="hidden sm:grid grid-cols-[1fr_100px_88px_72px] gap-2 px-3 py-2 bg-black/[0.03] dark:bg-white/[0.03] text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            <span>Signature</span>
            <span>Time</span>
            <span>Slot</span>
            <span className="text-right">Result</span>
          </div>
          {rows.map((tx) => {
            const ok = tx.err == null;
            return (
              <Link
                key={tx.signature}
                href={txPath(tx.signature)}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_88px_72px] gap-1 sm:gap-2 px-3 py-2.5 hover:bg-rose-500/[0.06] transition items-center"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  )}
                  <span className="font-mono text-xs text-gray-800 dark:text-white/85 truncate">
                    {shortSig(tx.signature)}
                  </span>
                  <ExternalLink className="w-3 h-3 text-gray-300 dark:text-white/25 shrink-0 hidden sm:block" />
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-500 tabular-nums pl-5 sm:pl-0">
                  <Clock className="w-3 h-3 sm:hidden" />
                  {fmtWhen(tx.blockTime)}
                </div>
                <span className="text-[11px] font-mono text-gray-400 tabular-nums pl-5 sm:pl-0">
                  {tx.slot.toLocaleString()}
                </span>
                <span
                  className={`text-[11px] font-semibold text-right pl-5 sm:pl-0 ${
                    ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  }`}
                >
                  {ok ? "Success" : "Failed"}
                </span>
                {tx.memo && (
                  <p className="sm:col-span-4 text-[10px] text-gray-400 truncate pl-5">
                    memo: {tx.memo}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {hasMore && nextBefore && (
        <button
          type="button"
          onClick={() => void load({ before: nextBefore, append: true })}
          disabled={loadingMore}
          className="w-full min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {loadingMore ? (
            <>
              <Spinner size={14} /> Loading…
            </>
          ) : (
            <>
              <ChevronDown size={16} /> Load more
            </>
          )}
        </button>
      )}
    </div>
  );
}
