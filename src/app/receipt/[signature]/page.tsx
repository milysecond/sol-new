"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Receipt, X } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Navbar } from "@/components/navbar";
import { ReceiptCard } from "@/components/receipt-card";
import { ReceiptSearch } from "@/components/receipt-search";
import {
  type ReceiptData,
  fetchReceipt,
  isValidSignature,
} from "@/lib/receipt";
import { analytics } from "@/lib/analytics";

export default function ReceiptSignaturePage() {
  const params = useParams<{ signature: string }>();
  const signature = typeof params.signature === "string" ? params.signature : "";
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);

  const valid = isValidSignature(signature);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(valid);
  const [error, setError] = useState<string | null>(
    valid ? null : "Invalid transaction signature",
  );

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setError("Invalid transaction signature");
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchReceipt(signature)
      .then((tx) => {
        if (cancelled) return;
        setData(tx);
        analytics.shareClicked("receipt_view", `/receipt/${signature}`);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load transaction");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signature, valid]);

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <div className="print:hidden">
        <Navbar />
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-4 sm:py-8 pb-safe">
        <div className="w-full max-w-md space-y-3">
          {/* Compact search chrome */}
          <div className="print:hidden rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/receipt"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-500 hover:text-purple-400 transition"
              >
                <Receipt className="w-4 h-4" />
                Receipt
              </Link>
              <button
                type="button"
                onClick={() => router.push("/receipt")}
                className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-gray-500 hover:text-gray-800 dark:hover:text-white transition"
                aria-label="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ReceiptSearch
              initial={signature}
              compact
              onNavigate={(sig) => router.push(`/receipt/${sig}`)}
            />
          </div>

          {loading && (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-10 text-center">
              <Spinner size={32} className="w-8 h-8 text-purple-500 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-white/40">
                Verifying transaction…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-rose-600 dark:text-rose-400 text-sm max-w-sm mx-auto leading-relaxed">
                {error}
              </p>
              {valid && (
                <a
                  href={`/receipt/${signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-medium text-gray-600 dark:text-white/60 hover:text-purple-500 transition"
                >
                  Open on Solscan
                </a>
              )}
              <div>
                <Link
                  href="/receipt"
                  className="inline-block text-sm font-medium text-purple-500 hover:underline"
                >
                  Try another signature
                </Link>
              </div>
            </div>
          )}

          {!loading && data && <ReceiptCard ref={receiptRef} tx={data} />}
        </div>
      </main>
    </div>
  );
}
