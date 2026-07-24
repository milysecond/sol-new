"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Droplets } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { signVersionedAndSend } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import {
  DEFAULT_LST,
  JUP_SWAP_API,
  SANCTUM_LSTS,
  WSOL_MINT,
  type LstOption,
} from "@/lib/lsts";

type Direction = "stake" | "unstake";

export default function LstPage() {
  const { publicKey, balance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [lst, setLst] = useState<LstOption>(DEFAULT_LST);
  const [direction, setDirection] = useState<Direction>("stake");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const inputMint = direction === "stake" ? WSOL_MINT : lst.mint;
  const outputMint = direction === "stake" ? lst.mint : WSOL_MINT;

  const amountAtomic = useMemo(() => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1e9);
  }, [amount]);

  const refreshQuote = useCallback(async () => {
    if (!amountAtomic || amountAtomic < 1_000_000) {
      setQuoteOut(null);
      return;
    }
    setQuoting(true);
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: String(amountAtomic),
        slippageBps: "50",
        swapMode: "ExactIn",
      });
      const res = await fetch(`${JUP_SWAP_API}/quote?${params}`);
      const data = (await res.json()) as { outAmount?: string; error?: string };
      if (!res.ok || !data.outAmount) {
        setQuoteOut(null);
        return;
      }
      const out = Number(data.outAmount) / 1e9;
      setQuoteOut(out.toFixed(6).replace(/\.?0+$/, ""));
    } catch {
      setQuoteOut(null);
    } finally {
      setQuoting(false);
    }
  }, [amountAtomic, inputMint, outputMint]);

  useEffect(() => {
    const t = setTimeout(() => void refreshQuote(), 350);
    return () => clearTimeout(t);
  }, [refreshQuote]);

  const submit = async () => {
    if (!publicKey || !amountAtomic) return;
    if (network !== "mainnet") {
      setError("Switch to mainnet for liquid staking.");
      return;
    }
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      if (direction === "stake") {
        const bal = Math.round((balance ?? 0) * 1e9);
        if (amountAtomic + 15_000 > bal) {
          throw new Error("Not enough SOL (leave a little for fees).");
        }
      }

      const quoteParams = new URLSearchParams({
        inputMint,
        outputMint,
        amount: String(amountAtomic),
        slippageBps: "50",
        swapMode: "ExactIn",
      });
      const qRes = await fetch(`${JUP_SWAP_API}/quote?${quoteParams}`);
      const quote = await qRes.json();
      if (!qRes.ok) throw new Error("Quote failed. Try a different amount or LST.");

      const sRes = await fetch(`${JUP_SWAP_API}/swap-instructions`, {
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
      if (!sRes.ok) throw new Error("Could not build swap instructions.");

      const bRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swapInstructionsResponse: swapIxs }),
      });
      const bData = (await bRes.json()) as { ok?: boolean; tx?: string; error?: string };
      if (!bRes.ok || !bData.tx) throw new Error(bData.error || "Build failed");

      const signature = await signVersionedAndSend(bData.tx, rpc, publicKey);
      setSig(signature);
      setTimeout(() => void refreshBalance(), 1500);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const maxAmount = () => {
    if (direction !== "stake") return;
    const bal = Math.round((balance ?? 0) * 1e9);
    const sendable = Math.max(0, bal - 20_000);
    if (sendable < 1_000_000) {
      setError("Not enough SOL after fees.");
      return;
    }
    setError(null);
    setAmount((sendable / 1e9).toFixed(4).replace(/\.?0+$/, "") || "0");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="liquid stake">
          <PageTransition>
            <div className="w-full sm:max-w-lg space-y-6">
              <div className="text-center space-y-2">
                <Droplets className="mx-auto text-cyan-400" size={36} />
                <h1 className="text-3xl font-bold tracking-tight">Liquid stake</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">
                  Sanctum-ecosystem LSTs. Swap SOL for liquid staked SOL and stay
                  free to trade while earning.
                </p>
                <p className="text-[11px] text-gray-400">
                  Native stake →{" "}
                  <a href="/stake" className="text-purple-400 hover:underline">
                    /stake
                  </a>
                  {" · "}
                  USDC yield (Lulo) →{" "}
                  <a href="/earn" className="text-emerald-400 hover:underline">
                    /earn
                  </a>
                </p>
              </div>

              <div className="flex gap-2">
                {(
                  [
                    ["stake", "SOL → LST"],
                    ["unstake", "LST → SOL"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDirection(id)}
                    disabled={busy}
                    className={`flex-1 py-2 rounded-xl text-sm transition cursor-pointer ${
                      direction === id
                        ? "bg-cyan-600 text-white"
                        : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                    LST
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SANCTUM_LSTS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLst(opt)}
                        disabled={busy}
                        className={`text-left px-3 py-2 rounded-xl border text-xs transition cursor-pointer ${
                          lst.id === opt.id
                            ? "bg-cyan-500/15 border-cyan-400/50 text-cyan-100"
                            : "bg-white dark:bg-black border-black/10 dark:border-white/10 text-gray-600 dark:text-white/70"
                        }`}
                      >
                        <span className="font-semibold block">{opt.symbol}</span>
                        <span className="text-[10px] text-gray-400 line-clamp-1">
                          {opt.blurb}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                    Amount ({direction === "stake" ? "SOL" : lst.symbol})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                      className="w-full px-3 py-2.5 pr-16 rounded-xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-sm"
                    />
                    {direction === "stake" && (
                      <button
                        type="button"
                        onClick={maxAmount}
                        disabled={busy}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
                      >
                        Max
                      </button>
                    )}
                  </div>
                  {direction === "stake" && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Balance: {(balance ?? 0).toFixed(4)} SOL
                    </p>
                  )}
                </div>

                <div className="text-xs text-gray-500 dark:text-white/50 min-h-[1.25rem]">
                  {quoting && "Quoting…"}
                  {!quoting && quoteOut && (
                    <>
                      Est. receive ≈{" "}
                      <span className="font-semibold text-cyan-400">
                        {quoteOut} {direction === "stake" ? lst.symbol : "SOL"}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy || !amountAtomic}
                  onClick={() => void submit()}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {busy ? <Spinner size={16} /> : null}
                  {direction === "stake"
                    ? `Get ${lst.symbol}`
                    : `Unstake to SOL`}
                </button>
              </div>

              {sig && (
                <a
                  href={`https://solscan.io/tx/${sig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-cyan-400 font-mono truncate hover:underline"
                >
                  {sig}
                </a>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs">
                  {error}
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                Swaps route through Jupiter for deep LST liquidity in the Sanctum
                ecosystem. sol.new never holds your funds.{" "}
                <a
                  href="https://sanctum.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  sanctum.so
                </a>
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
