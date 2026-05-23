"use client";

import { useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { signVersionedAndSend } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";

export function ConvertToSolCard() {
  const { publicKey, usdcBalance, balance, refreshBalance } = useWallet();
  const { rpc } = useNetwork();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Show only when there's USDC to convert and the wallet has little/no SOL.
  // Threshold of 0.01 SOL = ~$2 of buffer so we don't nag users who already
  // have some SOL.
  if (!publicKey) return null;
  if (usdcBalance === null || usdcBalance < 0.5) return null;
  if (balance !== null && balance > 0.01) return null;

  const convert = async () => {
    if (!publicKey || !usdcBalance) return;
    setErr(null);
    setBusy(true);
    try {
      const qRes = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdcAmount: usdcBalance }),
      });
      const qData = await qRes.json();
      if (!qRes.ok || !qData.quote) throw new Error(qData.error || "Quote failed");

      const bRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPublicKey: publicKey, quoteResponse: qData.quote }),
      });
      const bData = await bRes.json();
      if (!bRes.ok || !bData.tx) throw new Error(bData.error || "Build failed");

      await signVersionedAndSend(bData.tx, rpc, publicKey);
      setDone(true);
      setTimeout(() => refreshBalance(), 1500);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't convert. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-400/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowDownUp size={16} className="text-fuchsia-400" />
        <p className="font-semibold text-gray-900 dark:text-white text-sm">
          ${usdcBalance.toFixed(2)} USDC ready to convert
        </p>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/50 leading-relaxed">
        Your Apple Pay purchase arrived as USDC. Convert to SOL to use the app — we cover the gas fee.
      </p>
      {err && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">
          {err}
        </div>
      )}
      <button
        onClick={convert}
        disabled={busy || done}
        className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        {done ? <><Check size={14} /> Converted!</> : busy ? "Converting…" : "Convert to SOL"}
      </button>
    </div>
  );
}
