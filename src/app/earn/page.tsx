"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TrendingUp } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";

export default function EarnPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("10");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<unknown>(null);
  const [sig, setSig] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const res = await fetch(`/api/earn/lulo${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        rates?: unknown;
        error?: string;
      };
      setConfigured(data.configured === true);
      setRates(data.rates ?? null);
    } catch {
      setConfigured(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!publicKey) return;
    if (network !== "mainnet") {
      setError("Switch to mainnet to earn.");
      return;
    }
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const res = await fetch("/api/earn/lulo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          wallet: publicKey,
          amount: amount.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        transactions?: string[];
      };
      if (!res.ok) throw new Error(data.error || "Earn request failed");

      const txs = data.transactions || [];
      if (txs.length === 0) {
        throw new Error("No transactions returned. Try again in a moment.");
      }

      const { keypair } = await getPasskeyKeypair();
      const connection = new Connection(rpc, "confirmed");
      let lastSig = "";

      for (const b64 of txs) {
        const tx = Transaction.from(Buffer.from(b64, "base64"));
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        if (!tx.feePayer) tx.feePayer = new PublicKey(publicKey);
        tx.partialSign(keypair);
        lastSig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction(
          { signature: lastSig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
      }

      setSig(lastSig);
      await refreshBalance();
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const rateHint = (() => {
    if (!rates || typeof rates !== "object") return null;
    const r = rates as Record<string, unknown>;
    const candidates = [r.protectedApy, r.protected, r.apy, r.rate, r.Protected];
    for (const c of candidates) {
      if (typeof c === "number") return `${(c * (c < 1 ? 100 : 1)).toFixed(2)}%`;
      if (typeof c === "string") return c;
    }
    return null;
  })();

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="earn yield">
          <PageTransition>
            <div className="w-full sm:max-w-lg space-y-6">
              <div className="text-center space-y-2">
                <TrendingUp className="mx-auto text-emerald-400" size={36} />
                <h1 className="text-3xl font-bold tracking-tight">Earn</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">
                  Protected USDC yield on Solana. Deposit, earn, withdraw with your passkey.
                </p>
              </div>

              {configured === null && (
                <p className="text-center text-gray-400 text-sm flex justify-center gap-2">
                  <Spinner size={16} /> Loading…
                </p>
              )}

              {configured === false && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                  Earn is temporarily unavailable. Try again later.
                </div>
              )}

              {configured === true && (
                <>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm space-y-1">
                    <p>
                      Asset: <span className="font-semibold">USDC</span>
                    </p>
                    <p>
                      Mode: <span className="font-semibold">Protected</span>
                    </p>
                    {rateHint && (
                      <p>
                        APY: <span className="font-semibold text-emerald-400">{rateHint}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {(["deposit", "withdraw"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAction(a)}
                        className={`flex-1 py-2 rounded-xl text-sm capitalize transition cursor-pointer ${
                          action === a
                            ? "bg-emerald-600 text-white"
                            : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                      className="w-full pl-7 pr-3 py-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy || !amount || Number(amount) <= 0}
                    onClick={() => void submit()}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2 capitalize"
                  >
                    {busy ? <Spinner size={16} /> : null}
                    {action} USDC
                  </button>
                </>
              )}

              {sig && (
                <a
                  href={`https://solscan.io/tx/${sig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-emerald-400 font-mono truncate hover:underline"
                >
                  {sig}
                </a>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs">
                  {error}
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center">
                sol.new never takes custody of your funds. Passkey signs every move.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
