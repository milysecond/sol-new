"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ReceiptSearch } from "@/components/receipt-search";
import { EXAMPLE_TX } from "@/lib/receipt";

export default function ReceiptHomePage() {
  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 pb-safe">
        <div className="w-full max-w-md space-y-6">
          <header className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 mb-1">
              <Receipt className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Receipt
            </h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-white/40">
              Verify and share any Solana transaction as a clean receipt.
            </p>
          </header>

          <ReceiptSearch />

          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-8 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-gray-400 dark:text-white/30">
              <Receipt className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-medium text-gray-800 dark:text-white/90 mb-1">
              No transaction loaded
            </h2>
            <p className="text-sm text-gray-500 dark:text-white/40 mb-4">
              Paste a signature above, or try an example.
            </p>
            <Link
              href={`/receipt/${EXAMPLE_TX}`}
              className="text-sm font-medium text-purple-500 hover:text-purple-400 transition"
            >
              Open example receipt →
            </Link>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs text-gray-500 dark:text-white/40">
            <li className="rounded-xl border border-black/5 dark:border-white/5 px-3 py-2">
              SOL &amp; SPL transfers
            </li>
            <li className="rounded-xl border border-black/5 dark:border-white/5 px-3 py-2">
              Memo + USD value
            </li>
            <li className="rounded-xl border border-black/5 dark:border-white/5 px-3 py-2">
              Share image or print
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
