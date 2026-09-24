"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Copy, Check, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import { gumExplorer, type GumDepositChain } from "@/lib/gum-deposit";

export default function BridgePage() {
  const { publicKey } = useWallet();
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chains, setChains] = useState<GumDepositChain[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (publicKey) setDest(publicKey);
  }, [publicKey]);

  const load = useCallback(async (address: string) => {
    setBusy(true);
    setError(null);
    setChains(null);
    try {
      const r = await fetch(
        `/api/gum/deposit-addresses?destination=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { ok?: boolean; error?: string; chains?: GumDepositChain[] };
      if (!r.ok || !j.ok) throw new Error(j.error || "Could not load deposit addresses");
      setChains(j.chains || []);
    } catch (e) {
      setError(friendlyError(e, "GUM lookup failed."));
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 1500);
  };

  const usable = (c: GumDepositChain) =>
    c.status?.code !== 2 && Boolean(c.depositAddress);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-24">
        <ConnectGate action="bridge USDC">
          <PageTransition>
            <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6 max-w-lg mx-auto">
              <div className="text-center space-y-2">
                <AnimatedIcon icon={ArrowLeftRight} size={36} className="text-cyan-400" />
                <h1 className="text-2xl font-bold tracking-tight">Bridge to Solana</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">
                  Send USDC from Base, Arbitrum, Ethereum, or Sui. GUM lands USDC in this wallet.
                  Fee is live from the API (usually about $0.30).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 dark:text-white/40">Solana destination</label>
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value.trim())}
                  spellCheck={false}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy || dest.length < 32}
                  onClick={() => void load(dest)}
                  className="w-full min-h-[48px] bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-semibold rounded-xl px-4 touch-manipulation active:scale-[0.98]"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2 justify-center">
                      <Spinner size={16} /> Loading addresses
                    </span>
                  ) : (
                    "Get deposit addresses"
                  )}
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-500 break-all">{error}</p>
              )}

              {chains && (
                <div className="space-y-3">
                  {chains.length === 0 && (
                    <p className="text-sm text-gray-500">No source chains available right now.</p>
                  )}
                  {chains.map((c) => {
                    const ok = usable(c);
                    const ex = c.depositAddress ? gumExplorer(c.chainId, c.depositAddress) : null;
                    return (
                      <div
                        key={c.chainId}
                        className={`rounded-2xl border px-4 py-3 space-y-2 ${
                          ok
                            ? "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                            : "border-amber-500/30 bg-amber-500/5 opacity-70"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-semibold">{c.chainName}</p>
                          <p className="text-[11px] text-gray-400">
                            {ok
                              ? `min $${c.minDeposit ?? "?"} · fee $${c.feesUsd ?? "?"}`
                              : c.status?.name || "down"}
                          </p>
                        </div>
                        {ok && c.depositAddress ? (
                          <>
                            <p className="text-[11px] text-gray-500 dark:text-white/40">
                              Send USDC only to this address on {c.chainName}.
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs font-mono break-all text-gray-800 dark:text-white/80">
                                {c.depositAddress}
                              </code>
                              <button
                                type="button"
                                onClick={() => void copy(c.depositAddress!)}
                                className="shrink-0 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label={`Copy ${c.chainName} deposit address`}
                              >
                                {copied === c.depositAddress ? (
                                  <Check size={16} className="text-green-400" />
                                ) : (
                                  <Copy size={16} />
                                )}
                              </button>
                            </div>
                            {ex && (
                              <a
                                href={ex}
                                target={ex.startsWith("/") ? undefined : "_blank"}
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400"
                              >
                                View deposit address <ExternalLink size={11} />
                              </a>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Do not send on {c.chainName} until it is healthy.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-gray-400 dark:text-white/30 leading-relaxed">
                Powered by{" "}
                <a href="https://gum.ag" className="underline" target="_blank" rel="noopener noreferrer">
                  GUM Universal Deposit
                </a>
                . Unsupported tokens sent to a deposit address are not recoverable. Destination is
                always Solana USDC.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
