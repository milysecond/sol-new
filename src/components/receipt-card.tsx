"use client";

import { forwardRef, useState, type RefObject } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Printer,
  Share2,
  XCircle,
} from "lucide-react";
import { Spinner } from "@/components/spinner";
import { toast } from "@/lib/toast";
import {
  type ReceiptData,
  formatLamportsAsSol,
  formatReceiptAmount,
  formatTimestamp,
  formatUSD,
  shortAddr,
  shortSig,
} from "@/lib/receipt";

function Copyable({
  text,
  display,
  mono = true,
}: {
  text: string;
  display?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 max-w-full text-right rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 transition group ${
        mono ? "font-mono text-xs sm:text-sm" : "text-sm"
      }`}
      title={text}
    >
      <span className="break-all text-gray-900 dark:text-white">
        {display ?? text}
      </span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
      )}
    </button>
  );
}

function SolanaMark({ className = "w-6 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 397.7 311.7"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
      <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
      <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
    </svg>
  );
}

/** Dashed ticket-style divider with punch holes */
function TicketDivider() {
  return (
    <div className="relative flex items-center my-1">
      <div className="absolute -left-3 w-6 h-6 rounded-full bg-white dark:bg-black border border-black/10 dark:border-white/10" />
      <div className="absolute -right-3 w-6 h-6 rounded-full bg-white dark:bg-black border border-black/10 dark:border-white/10" />
      <div className="w-full border-t border-dashed border-black/15 dark:border-white/15" />
    </div>
  );
}

export const ReceiptCard = forwardRef<HTMLDivElement, { tx: ReceiptData }>(
  function ReceiptCard({ tx }, ref) {
    const amount = formatReceiptAmount(tx);
    const symbol = tx.tokenSymbol || "SOL";
    const failed = tx.status === "failed";
    const [sharing, setSharing] = useState(false);

    const handleShare = async () => {
      const el = (ref as RefObject<HTMLDivElement | null>)?.current;
      if (!el) return;
      setSharing(true);
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          backgroundColor: document.documentElement.classList.contains("dark")
            ? "#0a0a0a"
            : "#ffffff",
          cacheBust: true,
        });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `sol-new-receipt-${tx.signature.slice(0, 8)}.png`, {
          type: "image/png",
        });
        const { receiptSharePayload } = await import("@/lib/share-copy");
        const payload = receiptSharePayload({
          amount,
          symbol,
          signature: tx.signature,
          counterparty: tx.to || tx.from || null,
        });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: payload.title,
            text: payload.text,
            url: payload.url,
            files: [file],
          });
        } else if (navigator.share) {
          await navigator.share({
            title: payload.title,
            text: payload.text,
            url: payload.url,
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          await navigator.clipboard.writeText(payload.text);
          toast.success("Image saved · share text copied");
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          try {
            const { receiptSharePayload } = await import("@/lib/share-copy");
            const p = receiptSharePayload({
              amount,
              symbol,
              signature: tx.signature,
              counterparty: tx.to || tx.from || null,
            });
            await navigator.clipboard.writeText(p.text);
            toast.success("Share text copied");
          } catch {
            toast.error("Share failed");
          }
        }
      } finally {
        setSharing(false);
      }
    };

    const copyTx = async () => {
      try {
        await navigator.clipboard.writeText(tx.signature);
        toast.success("Transaction ID copied");
      } catch {
        toast.error("Couldn't copy");
      }
    };

    const title =
      tx.type === "spl-transfer"
        ? `${symbol} Transfer`
        : tx.type === "sol-transfer"
          ? "SOL Transfer"
          : "Transaction";

    return (
      <div
        ref={ref}
        className="rounded-3xl overflow-hidden bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 shadow-lg"
      >
        <div className="m-1 rounded-2xl overflow-hidden bg-white dark:bg-[#111113] border border-black/5 dark:border-white/5">
          {/* Header */}
          <div className="p-4 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-emerald-400/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm shrink-0 text-purple-500">
                {tx.tokenLogoURI ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tx.tokenLogoURI}
                    alt=""
                    className="w-8 h-8 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <SolanaMark className="w-7 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {title}
                </div>
                <p className="text-sm text-gray-500 dark:text-white/40">
                  {formatTimestamp(tx.timestamp)}
                </p>
              </div>
            </div>
            <div
              className={`px-2.5 py-1 rounded-full flex items-center gap-1 text-xs font-medium shrink-0 ${
                failed
                  ? "bg-rose-500/10 text-rose-500"
                  : "bg-emerald-500/10 text-emerald-500"
              }`}
            >
              {failed ? (
                <>
                  <XCircle className="w-3.5 h-3.5" /> Failed
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Confirmed
                </>
              )}
            </div>
          </div>

          <TicketDivider />

          {/* Details */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex justify-between items-start gap-3">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 pt-1">
                Tx
              </span>
              <Copyable text={tx.signature} display={shortSig(tx.signature)} />
            </div>

            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-white/40">Amount</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-500 dark:text-purple-400">
                  {amount} {symbol}
                </div>
                {tx.usdValue != null && tx.usdValue > 0 && (
                  <div className="text-sm text-gray-500 dark:text-white/40">
                    ~{formatUSD(tx.usdValue)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-start gap-3">
              <span className="text-sm text-gray-500 dark:text-white/40 pt-1">From</span>
              <Copyable text={tx.from} display={shortAddr(tx.from, 6)} />
            </div>

            {tx.to && (
              <div className="flex justify-between items-start gap-3">
                <span className="text-sm text-gray-500 dark:text-white/40 pt-1">To</span>
                <Copyable text={tx.to} display={shortAddr(tx.to, 6)} />
              </div>
            )}

            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-white/40">Fee</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {formatLamportsAsSol(tx.fee)} SOL
              </span>
            </div>

            {tx.memo && (
              <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 p-3 flex justify-between items-start gap-3">
                <span className="text-sm font-medium text-gray-500 dark:text-white/40 pt-0.5">
                  Memo
                </span>
                <Copyable text={tx.memo} display={tx.memo} mono={false} />
              </div>
            )}

            {tx.slot > 0 && (
              <div className="flex justify-between items-center gap-3 text-xs text-gray-400 dark:text-white/30">
                <span>Slot</span>
                <span className="font-mono">{tx.slot.toLocaleString()}</span>
              </div>
            )}
          </div>

          <TicketDivider />

          {/* Total + actions */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-white/40">Total</span>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                {amount} {symbol}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 print:hidden">
              <button
                type="button"
                onClick={copyTx}
                className="touch-target flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-white/80 hover:bg-black/[0.07] dark:hover:bg-white/[0.1] transition"
              >
                <Copy className="w-3.5 h-3.5" /> Copy ID
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className="touch-target flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-white/80 hover:bg-black/[0.07] dark:hover:bg-white/[0.1] transition disabled:opacity-60"
              >
                {sharing ? (
                  <Spinner size={16} className="w-3.5 h-3.5" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                Share
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="touch-target flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-xs font-medium text-gray-700 dark:text-white/80 hover:bg-black/[0.07] dark:hover:bg-white/[0.1] transition"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            <a
              href={`https://solscan.io/tx/${tx.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="print:hidden flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-emerald-400 text-white text-sm font-semibold hover:opacity-90 transition"
            >
              View on Solscan <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {!failed && (
            <div className="flex justify-end items-center gap-1.5 px-4 pb-4 text-[11px] text-gray-400 dark:text-white/30">
              <SolanaMark className="w-3 h-2.5 opacity-50" />
              <span>Verified on sol.new</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);
