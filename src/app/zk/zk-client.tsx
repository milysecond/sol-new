"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shield, ArrowRight, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import { formatAmountInput } from "@/lib/wallet-tokens";
import { addressPath, txPath } from "@/lib/explorer";
import {
  fetchZkSolSnapshot,
  installZkSolRelayer,
  ZK_SOL_DOCS,
  type ZkSolSnapshot,
} from "@/lib/zk-sol";
import {
  getPrivateSolBalance,
  openPrivacyCashSession,
  privateSendSol,
  shieldSol,
  solToLamports,
} from "@/lib/privacy-cash";

type Mode = "shield" | "send";
const FEE_RESERVE = 0.02;

export function ZkClient() {
  const { network, toggle, rpc } = useNetwork();
  const { publicKey, balance } = useWallet();
  const [snap, setSnap] = useState<ZkSolSnapshot | null>(null);
  const [mode, setMode] = useState<Mode>("shield");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [priv, setPriv] = useState<number | null>(null);
  const [busy, setBusy] = useState<"idle" | "cfg" | "bal" | "go">("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  useEffect(() => {
    installZkSolRelayer();
    let cancelled = false;
    setBusy("cfg");
    fetchZkSolSnapshot()
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, "Could not reach zk.sol.new"));
      })
      .finally(() => {
        if (!cancelled) setBusy((b) => (b === "cfg" ? "idle" : b));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicKey || network !== "mainnet") return;
    let cancelled = false;
    (async () => {
      setBusy("bal");
      try {
        installZkSolRelayer();
        const session = await openPrivacyCashSession(rpc, "mainnet");
        const bal = await getPrivateSolBalance(session);
        if (!cancelled) setPriv(bal);
      } catch {
        if (!cancelled) setPriv(null);
      } finally {
        if (!cancelled) setBusy((b) => (b === "bal" ? "idle" : b));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, network, rpc]);

  const maxShield = useMemo(() => {
    const sol = typeof balance === "number" ? balance : 0;
    return Math.max(0, sol - FEE_RESERVE);
  }, [balance]);

  const cfg = snap?.config;
  const relayerPk = snap?.relayer?.relayer?.publicKey;
  const live = Boolean(snap?.ok && (snap.health as { ok?: boolean } | undefined)?.ok);
  const feePct = cfg?.withdraw_fee_rate != null ? cfg.withdraw_fee_rate * 100 : null;
  const minOut = cfg?.minimum_withdrawal?.sol;
  const rent = cfg?.withdraw_rent_fee;
  const working = busy !== "idle";
  const field =
    "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none";

  const go = async () => {
    if (!publicKey) return;
    const ui = Number(amount);
    if (!Number.isFinite(ui) || ui <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    setBusy("go");
    setError(null);
    setSig(null);
    setStatus("Face ID");
    try {
      installZkSolRelayer();
      const session = await openPrivacyCashSession(rpc, "mainnet");
      const lamports = solToLamports(ui);
      let signature: string;
      if (mode === "shield") {
        if (ui > maxShield) throw new Error("Keep 0.02 SOL for fees");
        signature = await shieldSol(session, lamports, setStatus);
      } else {
        if (!to.trim()) throw new Error("Recipient required");
        signature = await privateSendSol(session, lamports, to.trim(), setStatus);
      }
      setSig(signature);
      setAmount("");
      setPriv(await getPrivateSolBalance(session));
    } catch (e) {
      setError(friendlyError(e, "ZK action failed"));
    } finally {
      setBusy("idle");
      setStatus("");
    }
  };

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <ConnectGate action="use ZK">
          <PageTransition>
            <div className="app-shell py-6 sm:py-10 space-y-6">
              <div className="text-center lg:text-left space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/15 text-violet-500">
                  <Shield className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ZK</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl">
                  Shield SOL through zk.sol.new. Passkey signs. Proofs stay in the browser.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`rounded-full px-3 py-1 ${
                    live ? "bg-emerald-500/15 text-emerald-500" : "bg-black/5 dark:bg-white/10 text-gray-400"
                  }`}
                >
                  {live ? "zk.sol.new live" : "zk.sol.new"}
                </span>
                {feePct != null && (
                  <span className="rounded-full px-3 py-1 bg-black/5 dark:bg-white/10 text-gray-500">
                    withdraw {feePct}%
                  </span>
                )}
                {rent != null && (
                  <span className="rounded-full px-3 py-1 bg-black/5 dark:bg-white/10 text-gray-500">
                    rent {rent} SOL
                  </span>
                )}
                {minOut != null && (
                  <span className="rounded-full px-3 py-1 bg-black/5 dark:bg-white/10 text-gray-500">
                    min out {minOut} SOL
                  </span>
                )}
                <a
                  href={ZK_SOL_DOCS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-3 py-1 bg-violet-500/15 text-violet-500"
                >
                  docs
                </a>
              </div>

              {relayerPk && (
                <p className="text-xs text-gray-400">
                  Relayer{" "}
                  <Link href={addressPath(relayerPk)} className="font-mono text-violet-500">
                    {relayerPk.slice(0, 4)}…{relayerPk.slice(-4)}
                  </Link>
                </p>
              )}

              {network !== "mainnet" && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 space-y-2">
                  <p className="text-sm">zk.sol.new is mainnet. Switch to live to shield.</p>
                  <button
                    type="button"
                    onClick={() => toggle()}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3.5 py-2"
                  >
                    Switch to mainnet
                  </button>
                </div>
              )}

              {network === "mainnet" && (
                <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 sm:p-5 space-y-4">
                  <div className="flex gap-2">
                    {(["shield", "send"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={working}
                        onClick={() => setMode(m)}
                        className={`min-h-11 px-4 rounded-xl text-sm font-semibold ${
                          mode === m
                            ? "bg-violet-500 text-white"
                            : "bg-black/5 dark:bg-white/10 text-gray-600 dark:text-white/70"
                        }`}
                      >
                        {m === "shield" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <ArrowDownToLine className="w-4 h-4" /> Shield
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <ArrowUpFromLine className="w-4 h-4" /> Send / unshield
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
                      <p className="text-xs text-gray-400">Wallet</p>
                      <p className="font-mono tabular-nums">{maxShield.toFixed(4)} SOL</p>
                    </div>
                    <div className="rounded-xl bg-black/5 dark:bg-white/5 p-3">
                      <p className="text-xs text-gray-400">Private</p>
                      <p className="font-mono tabular-nums">
                        {priv == null ? (busy === "bal" ? "..." : "-") : `${priv.toFixed(4)} SOL`}
                      </p>
                    </div>
                  </div>

                  {mode === "send" && (
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="Recipient address or name.sol"
                      disabled={working}
                      className={field}
                    />
                  )}

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <p className="text-xs text-gray-400">Amount</p>
                      <button
                        type="button"
                        className="text-xs text-violet-500"
                        disabled={working}
                        onClick={() =>
                          setAmount(formatAmountInput(mode === "shield" ? maxShield : priv || 0))
                        }
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
                  </div>

                  <button
                    type="button"
                    disabled={working || !amount}
                    onClick={() => void go()}
                    className="w-full min-h-12 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold inline-flex items-center justify-center gap-2"
                  >
                    {working ? <Spinner size={20} /> : <ArrowRight className="w-4 h-4" />}
                    {working
                      ? status || "Working"
                      : mode === "shield"
                        ? "Shield with Face ID"
                        : "Send with Face ID"}
                  </button>

                  {error && <p className="text-sm text-red-400">{error}</p>}
                  {sig && (
                    <Link href={txPath(sig)} className="text-sm text-violet-500 font-mono break-all">
                      Receipt {sig.slice(0, 8)}...
                    </Link>
                  )}
                </div>
              )}
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
