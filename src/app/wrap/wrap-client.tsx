"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import { ArrowDownToLine, ArrowUpFromLine, Repeat } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { formatAmountInput } from "@/lib/wallet-tokens";
import { addressPath, txPath } from "@/lib/explorer";
import {
  WSOL_MINT,
  getWsolUiBalance,
  unwrapSol,
  wrapSol,
} from "@/lib/wsol";

type Mode = "wrap" | "unwrap";
const FEE_RESERVE = 0.02;
const HINT = "FhzDkMVUDWa11BtxnGQ4FexNf3wcu5EzuQux1EJJ1qC1";

export function WrapClient() {
  const { rpc, network } = useNetwork();
  const { publicKey, balance, refreshBalance } = useWallet();
  const [mode, setMode] = useState<Mode>("wrap");
  const [amount, setAmount] = useState("");
  const [wsol, setWsol] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "bal" | "go">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const maxWrap = useMemo(() => {
    const sol = typeof balance === "number" ? balance : 0;
    return Math.max(0, sol - FEE_RESERVE);
  }, [balance]);

  const maxUnwrap = wsol;
  const max = mode === "wrap" ? maxWrap : maxUnwrap;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/scan?address=${HINT}`);
        const json = (await res.json()) as {
          type?: string;
          mint?: string;
          owner?: string;
        };
        if (cancelled) return;
        const mint = json.mint || "";
        if (json.type === "token_account" && mint === WSOL_MINT) {
          setMode("unwrap");
          setHint("That account is wSOL. Unwrap turns it back into SOL.");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setBusy("bal");
    const conn = new Connection(rpc, "confirmed");
    getWsolUiBalance(conn, new PublicKey(publicKey))
      .then((n) => {
        if (!cancelled) setWsol(n);
      })
      .catch(() => {
        if (!cancelled) setWsol(0);
      })
      .finally(() => {
        if (!cancelled) setBusy((b) => (b === "bal" ? "idle" : b));
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, rpc, sig]);

  const go = async () => {
    if (!publicKey) return;
    const ui = Number(amount);
    if (!Number.isFinite(ui) || ui <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (mode === "wrap" && ui > maxWrap) {
      setError("Keep 0.02 SOL for fees");
      return;
    }
    if (mode === "unwrap" && ui > maxUnwrap) {
      setError("Not enough wSOL");
      return;
    }
    setBusy("go");
    setError(null);
    setSig(null);
    try {
      const { keypair } = await getPasskeyKeypair(publicKey);
      const conn = new Connection(rpc, "confirmed");
      const signature =
        mode === "wrap"
          ? await wrapSol(conn, keypair, ui)
          : await unwrapSol(conn, keypair, ui);
      setSig(signature);
      setAmount("");
      refreshBalance();
      setWsol(await getWsolUiBalance(conn, keypair.publicKey));
    } catch (e) {
      setError(friendlyError(e, "Wrap failed"));
    } finally {
      setBusy("idle");
    }
  };

  const working = busy !== "idle";
  const field =
    "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none";

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <ConnectGate action="wrap SOL">
          <PageTransition>
            <div className="app-shell py-6 sm:py-10 space-y-6">
              <div className="text-center lg:text-left space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/15 text-cyan-500">
                  <Repeat className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Wrap</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl">
                  SOL to wSOL and back. Same wallet. Face ID signs. No protocol fee.
                </p>
              </div>

              {hint && <p className="text-sm text-cyan-600 dark:text-cyan-400">{hint}</p>}

              {network === "devnet" && (
                <p className="text-sm text-amber-500">Devnet wrap uses the same native mint.</p>
              )}

              <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 sm:p-5 space-y-4">
                <div className="flex gap-2">
                  {(["wrap", "unwrap"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setMode(m);
                        setAmount("");
                        setError(null);
                      }}
                      className={`min-h-11 px-4 rounded-xl text-sm font-semibold ${
                        mode === m
                          ? "bg-cyan-500 text-black"
                          : "bg-black/5 dark:bg-white/10 text-gray-600 dark:text-white/70"
                      }`}
                    >
                      {m === "wrap" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ArrowDownToLine className="w-4 h-4" /> Wrap
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <ArrowUpFromLine className="w-4 h-4" /> Unwrap
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
                    <p className="text-xs text-gray-400">SOL</p>
                    <p className="font-mono tabular-nums">{maxWrap.toFixed(4)}</p>
                  </div>
                  <div className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
                    <p className="text-xs text-gray-400">wSOL</p>
                    <p className="font-mono tabular-nums">{wsol.toFixed(4)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1.5">
                    <p className="text-xs text-gray-400">Amount</p>
                    <button
                      type="button"
                      className="text-xs text-cyan-600 dark:text-cyan-400"
                      disabled={working || max <= 0}
                      onClick={() => setAmount(formatAmountInput(max))}
                    >
                      Max
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={working}
                    placeholder="0.00"
                    className={field}
                  />
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={working || max <= 0}
                        onClick={() => setAmount(formatAmountInput((max * pct) / 100))}
                        className="flex-1 min-h-11 rounded-xl bg-black/5 dark:bg-white/10 text-sm font-semibold"
                      >
                        {pct === 100 ? "Max" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={working || !amount}
                  onClick={() => void go()}
                  className="w-full min-h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold inline-flex items-center justify-center gap-2"
                >
                  {working ? <Spinner size={20} /> : null}
                  {working
                    ? "Working"
                    : mode === "wrap"
                      ? "Wrap with Face ID"
                      : "Unwrap with Face ID"}
                </button>

                {error && <p className="text-sm text-red-400">{error}</p>}
                {sig && (
                  <Link href={txPath(sig)} className="text-sm text-cyan-600 dark:text-cyan-400 font-mono break-all">
                    Receipt {sig.slice(0, 8)}...
                  </Link>
                )}
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                Mint{" "}
                <Link href={addressPath(WSOL_MINT)} className="font-mono text-cyan-600 dark:text-cyan-400">
                  {WSOL_MINT.slice(0, 4)}...{WSOL_MINT.slice(-4)}
                </Link>
                . Rent stays in the wSOL account until you unwrap.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
