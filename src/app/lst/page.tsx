"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Droplets } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { DEFAULT_LST, SANCTUM_LSTS, WSOL_MINT, type LstOption } from "@/lib/lsts";

type Direction = "stake" | "unstake";

type EnrichedLst = LstOption & {
  apyLabel?: string | null;
  solValue?: number | null;
  tvl?: number | null;
};

type OrderResponse = {
  inp: string;
  out: string;
  inpAmt: string;
  outAmt: string;
  swapSrcData: unknown;
  tx?: string;
  error?: string;
};

function solToLamportsStr(sol: number): string {
  return Math.floor(sol * 1e9).toString();
}

function lamportsToSol(lamports: string | number): number {
  return Number(lamports) / 1e9;
}

async function signOrderTx(txB64: string, keypair: Keypair): Promise<string> {
  const raw = Buffer.from(txB64, "base64");
  try {
    const vtx = VersionedTransaction.deserialize(raw);
    vtx.sign([keypair]);
    return Buffer.from(vtx.serialize()).toString("base64");
  } catch {
    const tx = Transaction.from(raw);
    tx.partialSign(keypair);
    return Buffer.from(tx.serialize()).toString("base64");
  }
}

export default function LstPage() {
  const { publicKey, balance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [lsts, setLsts] = useState<EnrichedLst[]>(SANCTUM_LSTS);
  const [lst, setLst] = useState<EnrichedLst>(DEFAULT_LST);
  const [direction, setDirection] = useState<Direction>("stake");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [sanctumOk, setSanctumOk] = useState<boolean | null>(null);

  const inputMint = direction === "stake" ? WSOL_MINT : lst.mint;
  const outputMint = direction === "stake" ? lst.mint : WSOL_MINT;

  const amountAtomic = useMemo(() => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return solToLamportsStr(n);
  }, [amount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lst/meta", { cache: "no-store" });
        const data = (await res.json()) as {
          configured?: boolean;
          lsts?: EnrichedLst[];
        };
        if (cancelled) return;
        setSanctumOk(data.configured === true);
        if (data.lsts?.length) {
          setLsts(data.lsts);
          setLst((prev) => data.lsts!.find((x) => x.id === prev.id) || data.lsts![0]);
        }
      } catch {
        if (!cancelled) setSanctumOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshQuote = useCallback(async () => {
    if (!amountAtomic) {
      setQuoteOut(null);
      return;
    }
    setQuoting(true);
    try {
      const params = new URLSearchParams({
        inp: inputMint,
        out: outputMint,
        amt: amountAtomic,
        mode: "ExactIn",
        slippageBps: "50",
      });
      const res = await fetch(`/api/lst/order?${params}`, { cache: "no-store" });
      const data = (await res.json()) as OrderResponse;
      if (!res.ok || !data.outAmt) {
        setQuoteOut(null);
        return;
      }
      const out = lamportsToSol(data.outAmt);
      setQuoteOut(out.toFixed(6).replace(/\.?0+$/, ""));
    } catch {
      setQuoteOut(null);
    } finally {
      setQuoting(false);
    }
  }, [amountAtomic, inputMint, outputMint]);

  useEffect(() => {
    const t = setTimeout(() => void refreshQuote(), 400);
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
        if (Number(amountAtomic) + 15_000 > bal) {
          throw new Error("Not enough SOL (leave a little for fees).");
        }
      }

      // Order with signer so the route builds the unsigned tx
      const params = new URLSearchParams({
        inp: inputMint,
        out: outputMint,
        amt: amountAtomic,
        mode: "ExactIn",
        slippageBps: "50",
        signer: publicKey,
      });
      const oRes = await fetch(`/api/lst/order?${params}`, { cache: "no-store" });
      const order = (await oRes.json()) as OrderResponse;
      if (!oRes.ok) throw new Error(order.error || "Quote failed");
      if (!order.tx) throw new Error("No transaction returned. Try again.");

      const { keypair } = await getPasskeyKeypair(publicKey);
      const signedTx = await signOrderTx(order.tx, keypair);

      const eRes = await fetch("/api/lst/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTx, orderResponse: order }),
      });
      const eData = (await eRes.json()) as {
        signature?: string;
        error?: string;
      };

      let signature = eData.signature;
      if (!eRes.ok || !signature) {
        // Fallback: broadcast signed tx ourselves if execute rejects
        try {
          const conn = new Connection(rpc, "confirmed");
          const raw = Buffer.from(signedTx, "base64");
          try {
            const vtx = VersionedTransaction.deserialize(raw);
            signature = await conn.sendRawTransaction(vtx.serialize(), {
              skipPreflight: false,
              maxRetries: 3,
            });
          } catch {
            signature = await conn.sendRawTransaction(raw, {
              skipPreflight: false,
              maxRetries: 3,
            });
          }
          await conn.confirmTransaction(signature, "confirmed");
        } catch {
          throw new Error(eData.error || "Swap failed");
        }
      }

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
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="liquid stake">
          <PageTransition>
            <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6">
              <div className="text-center space-y-2">
                <Droplets className="mx-auto text-cyan-400" size={36} />
                <h1 className="text-3xl font-bold tracking-tight">Liquid stake</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">
                  Swap SOL for liquid staked tokens (and back) with your passkey.
                </p>
                <p className="text-[11px] text-gray-400">
                  Native stake →{" "}
                  <a href="/stake" className="text-purple-400 hover:underline">
                    /stake
                  </a>
                  {" · "}
                  USDC yield →{" "}
                  <a href="/earn" className="text-emerald-400 hover:underline">
                    /earn
                  </a>
                </p>
                {sanctumOk === false && (
                  <p className="text-[11px] text-amber-500">
                    Quotes unavailable — try again shortly.
                  </p>
                )}
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
                    {lsts.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLst(opt)}
                        disabled={busy}
                        className={`text-left px-3 py-2 rounded-xl border text-xs transition cursor-pointer ${
                          lst.id === opt.id
                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-900 dark:text-cyan-100"
                            : "bg-white dark:bg-black border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70"
                        }`}
                      >
                        <span className="font-semibold block">
                          {opt.symbol}
                          {opt.apyLabel ? (
                            <span className="font-normal text-cyan-700 dark:text-cyan-400/90 ml-1">
                              {opt.apyLabel}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-[10px] text-gray-400 line-clamp-1">
                          {opt.blurb}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {lst.solValue != null && (
                  <p className="text-[11px] text-gray-400">
                    1 {lst.symbol} ≈ {Number(lst.solValue).toFixed(4)} SOL
                    {lst.apyLabel ? ` · APY ${lst.apyLabel}` : ""}
                  </p>
                )}

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
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {busy ? <Spinner size={16} /> : null}
                  {direction === "stake" ? `Get ${lst.symbol}` : `Unstake to SOL`}
                </button>
              </div>

              {sig && (
                <a
                  href={`/receipt/${sig}`}
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
                sol.new never holds your funds. Passkey signs every swap.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
