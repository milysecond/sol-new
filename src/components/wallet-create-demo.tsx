"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Sparkles, Check, Loader2 } from "lucide-react";
import { ActionButton, type ActionButtonState } from "@/components/action-button";

type Phase = "idle" | "prompt" | "creating" | "done";

type Props = {
  onComplete?: (fakeAddress: string) => void;
};

/**
 * Passkey wallet creation motion — calm phases, not flashy.
 */
export function WalletCreateDemo({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [btn, setBtn] = useState<ActionButtonState>("idle");
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "creating") return;
    const t1 = setTimeout(() => setPhase("done"), 1600);
    return () => clearTimeout(t1);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done" || !address) return;
    setBtn("success");
    onComplete?.(address);
  }, [phase, address, onComplete]);

  const start = () => {
    setBtn("loading");
    setPhase("prompt");
    setAddress(null);
    // simulate Face ID prompt then create
    setTimeout(() => {
      setPhase("creating");
      const fake =
        "Demo" +
        Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 12);
      setAddress(fake + "…pump");
    }, 900);
  };

  const reset = () => {
    setPhase("idle");
    setBtn("idle");
    setAddress(null);
  };

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-4 bg-gradient-to-b from-purple-500/[0.06] to-transparent">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <div
          className={`relative w-16 h-16 rounded-2xl inline-flex items-center justify-center transition-all duration-500 ${
            phase === "done"
              ? "bg-emerald-500/15 text-emerald-500 scale-100"
              : phase === "creating" || phase === "prompt"
                ? "bg-purple-500/20 text-purple-500 scale-105"
                : "bg-black/5 dark:bg-white/5 text-purple-500"
          }`}
        >
          {phase === "done" ? (
            <Check size={28} strokeWidth={2.5} />
          ) : phase === "creating" ? (
            <Loader2 size={28} className="animate-spin" />
          ) : phase === "prompt" ? (
            <Fingerprint size={28} className="animate-pulse" />
          ) : (
            <Sparkles size={28} />
          )}
          {(phase === "prompt" || phase === "creating") && (
            <span className="absolute inset-0 rounded-2xl ring-2 ring-purple-400/40 animate-ping opacity-40" />
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {phase === "idle" && "Create passkey wallet"}
            {phase === "prompt" && "Approve Face ID…"}
            {phase === "creating" && "Deriving wallet…"}
            {phase === "done" && "Wallet ready"}
          </p>
          <p className="text-xs text-gray-500 dark:text-white/45 mt-1 max-w-[16rem] mx-auto leading-relaxed">
            {phase === "done" && address
              ? address
              : "No seed phrase. Demo animation only — does not create a real wallet."}
          </p>
        </div>
      </div>

      {phase === "done" ? (
        <ActionButton state="success" idleLabel="Created" successLabel="Created" onClick={reset} />
      ) : (
        <ActionButton
          state={btn === "loading" ? "loading" : "idle"}
          idleLabel="Create with passkey"
          loadingLabel={phase === "prompt" ? "Waiting for Face ID…" : "Creating…"}
          onClick={start}
        />
      )}
      {phase === "done" && (
        <button
          type="button"
          onClick={reset}
          className="w-full text-xs text-gray-500 py-1 hover:text-gray-800 dark:hover:text-white/70"
        >
          Reset demo
        </button>
      )}
    </div>
  );
}
