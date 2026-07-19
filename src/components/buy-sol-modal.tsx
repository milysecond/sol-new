"use client";

import { useState } from "react";
import { Apple, X } from "lucide-react";
import { friendlyError } from "@/lib/friendly-errors";
import { BottomSheet } from "@/components/bottom-sheet";

export function BuySolModal({
  open,
  onClose,
  publicKey,
  title = "Buy SOL",
  subtitle = "Apple Pay · no signup",
}: {
  open: boolean;
  onClose: () => void;
  publicKey: string;
  title?: string;
  subtitle?: string;
}) {
  const [amount, setAmount] = useState(25);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const buy = async () => {
    if (!publicKey) return;
    setBuyError(null);
    setBuying(true);
    try {
      const res = await fetch("/api/onramp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey, amount }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to start payment");
      window.location.href = data.url;
    } catch (e) {
      setBuyError(friendlyError(e, "Couldn't start payment. Try again."));
      setBuying(false);
    }
  };

  const isValid = amount >= 20 && amount <= 150;

  return (
    <BottomSheet open={open} onClose={onClose} className="p-6 sm:p-7 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Apple size={20} /> {title}
          </h2>
          <p className="text-xs text-gray-500 dark:text-white/40 mt-1">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
          aria-label="Close"
        >
          <X size={18} className="text-gray-500 dark:text-white/50" />
        </button>
      </div>

      <div>
        <label className="text-xs text-gray-500 dark:text-white/40 mb-1.5 block uppercase tracking-wider">Amount</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[20, 50, 100, 150].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(n)}
              className={`rounded-lg py-2.5 text-sm font-medium transition cursor-pointer ${
                amount === n
                  ? "bg-fuchsia-500/20 border border-fuchsia-400/50 text-fuchsia-500 dark:text-fuchsia-300"
                  : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              ${n}
            </button>
          ))}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30">$</span>
          <input
            type="number"
            min={20}
            max={150}
            value={amount}
            onChange={(e) => setAmount(Math.max(20, Math.min(150, parseInt(e.target.value) || 20)))}
            className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-fuchsia-400/50 text-sm tabular-nums"
          />
        </div>
        <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1.5">
          No signup required up to $150. Larger purchases need ID verification.
        </p>
      </div>

      {buyError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">{buyError}</div>
      )}

      <button
        onClick={buy}
        disabled={!isValid || buying}
        className="w-full flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl px-5 py-3.5 hover:bg-black/85 dark:hover:bg-white/85 transition active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {buying ? "Starting…" : <><Apple size={18} /> Pay ${amount}</>}
      </button>

      <p className="text-[10px] text-gray-400 dark:text-white/30 text-center leading-snug">
        Processed by MoonPay. Card, Apple Pay &amp; more. SOL arrives within minutes.
      </p>
    </BottomSheet>
  );
}
