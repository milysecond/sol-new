"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { isValidSignature } from "@/lib/receipt";

export function ReceiptSearch({
  initial = "",
  compact = false,
  onNavigate,
}: {
  initial?: string;
  compact?: boolean;
  onNavigate?: (sig: string) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a transaction signature");
      return;
    }
    if (!isValidSignature(trimmed)) {
      setError("Invalid signature format (Base58, 87–88 characters)");
      return;
    }
    setError("");
    setLoading(true);
    if (onNavigate) onNavigate(trimmed);
    else router.push(`/receipt/${trimmed}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          placeholder="Paste transaction signature"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={`w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-purple-400/50 focus:ring-2 focus:ring-purple-400/20 transition ${
            compact ? "px-3 py-2 pr-9 text-sm" : "px-4 py-3 pr-11 text-base"
          }`}
        />
        <Search
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 ${
            compact ? "w-4 h-4" : "w-5 h-5"
          }`}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className={`touch-target flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-emerald-400 text-white font-semibold hover:opacity-90 transition disabled:opacity-70 ${
          compact ? "py-2 px-3 text-sm" : "py-3 px-4 text-base"
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
          </>
        ) : (
          "Verify transaction"
        )}
      </button>
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}
    </form>
  );
}
