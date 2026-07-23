"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TrendingUp, ExternalLink } from "lucide-react";
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
  const [account, setAccount] = useState<unknown>(null);
  const [sig, setSig] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const res = await fetch(`/api/earn/lulo${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        rates?: unknown;
        account?: unknown;
        error?: string;
      };
      setConfigured(data.configured === true);
      setRates(data.rates ?? null);
      setAccount(data.account ?? null);
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
      setError("Switch to mainnet for Lulo earn.");
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
        raw?: unknown;
      };
      if (!res.ok) throw new Error(data.error || "Lulo request failed");

      const txs = data.transactions || [];
      if (txs.length === 0) {
        throw new Error(
          "Lulo returned no transactions. Check API response shape or API key permissions.",
        );
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
                  Protected stablecoin yield via{" "}
                  <a
                    href="https://lulo.fi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    Lulo <ExternalLink size={12} />
                  </a>
                  . Not validator staking.
                </p>
              </div>

              {configured === null && (
                <p className="text-center text-gray-400 text-sm flex justify-center gap-2">
                  <Spinner size={16} /> Checking Lulo…
                </p>
              )}

              {configured === false && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300 space-y-2">
                  <p className="font-semibold">Lulo API key not set on this environment</p>
                  <p className="text-xs opacity-90">
                    Add Worker secret <code className="font-mono">LULO_API_KEY</code> from{" "}
                    <a
                      href="https://dev.lulo.fi"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      dev.lulo.fi
                    </a>
                    . UI is ready; deposit/withdraw activate once the key is live.
                  </p>
                </div>
              )}

              {configured === true && (
                <>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm space-y-1">
                    <p>
                      Product: <span className="font-semibold">Lulo Protected</span> (USDC)
                    </p>
                    {rateHint && (
                      <p>
                        APY hint: <span className="font-semibold text-emerald-400">{rateHint}</span>
                      </p>
                    )}
                    {account != null && (
                      <pre className="text-[10px] mt-2 overflow-x-auto max-h-24 text-gray-500">
                        {JSON.stringify(account, null, 0).slice(0, 400)}
                      </pre>
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
                Yield is provided by Lulo infrastructure. sol.new never takes custody. /stake redirects
                here.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
