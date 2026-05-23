"use client";

import { useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { signVersionedAndSend } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag/swap/v1";

export function ConvertToSolCard() {
  const { publicKey, usdcBalance, balance, refreshBalance } = useWallet();
  const { rpc } = useNetwork();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!publicKey) return null;
  if (usdcBalance === null || usdcBalance < 0.5) return null;
  if (balance !== null && balance > 0.01) return null;

  const convert = async () => {
    if (!publicKey || !usdcBalance) return;
    setErr(null);
    setBusy(true);
    try {
      // Convert 95% of USDC, leaving a buffer for ATA rent + slippage.
      const swapAmount = Math.floor(usdcBalance * 0.95 * 1_000_000);
      if (swapAmount < 100_000) throw new Error("USDC amount too small to swap");

      // Quote — direct browser → Jupiter (avoids CF→CF routing issues).
      const quoteParams = new URLSearchParams({
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        amount: String(swapAmount),
        slippageBps: "100",
        swapMode: "ExactIn",
      });
      const qRes = await fetch(`${JUP}/quote?${quoteParams.toString()}`);
      const quote = await qRes.json();
      if (!qRes.ok) throw new Error("Quote failed");

      // Swap-instructions — also direct from browser.
      const sRes = await fetch(`${JUP}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey,
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });
      const swapIxs = await sRes.json();
      if (!sRes.ok) throw new Error("Swap instructions failed");

      // Server assembles + signs as fee payer.
      const bRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapInstructionsResponse: swapIxs }),
      });
      const bData = (await bRes.json()) as { ok?: boolean; tx?: string; error?: string };
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
