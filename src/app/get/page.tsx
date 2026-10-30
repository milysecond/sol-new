"use client";

import { useState, useCallback, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { MoneyGramRampsCard } from "@/components/moneygram-ramps";
import { CrossmintFundCard } from "@/components/crossmint-fund-card";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Download, Copy, Check, Droplets, ExternalLink, DollarSign } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { friendlyError } from "@/lib/friendly-errors";
import { Spinner } from "@/components/spinner";

function CreditsBuySection() {
  const { publicKey } = useWallet();
  const [ok, setOk] = useState<boolean | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setOk(null);
      return;
    }
    try {
      const res = await fetch(`/api/credits/checkout?wallet=${encodeURIComponent(publicKey)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        configured?: boolean;
        balanceCredits?: number;
      };
      setOk(data.configured === true);
      setBalance(Number(data.balanceCredits || 0));
    } catch {
      setOk(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apply credit after Stripe return — retry until paid + ledger write
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    const run = async () => {
      try {
        const q = new URLSearchParams(window.location.search);
        const successQ = q.get("credits") === "success";
        const sid =
          q.get("session_id") ||
          sessionStorage.getItem("sol.new.credits.session") ||
          "";
        if (successQ && sid) {
          try {
            sessionStorage.setItem("sol.new.credits.session", sid);
          } catch {
            /* ignore */
          }
        }
        if (!sid || !sid.startsWith("cs_")) return;
        if (!successQ && !sessionStorage.getItem("sol.new.credits.session")) return;

        setSuccess(true);
        setConfirming(true);
        setError(null);

        for (let i = 0; i < 8 && !cancelled; i++) {
          const res = await fetch("/api/credits/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid, wallet: publicKey }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            paid?: boolean;
            applied?: boolean;
            balanceCredits?: number;
            balanceCents?: number;
            retry?: boolean;
            error?: string;
            status?: string;
          };
          if (res.ok && data.ok && data.paid) {
            setBalance(Number(data.balanceCredits ?? data.balanceCents ?? 0));
            try {
              sessionStorage.removeItem("sol.new.credits.session");
              const url = new URL(window.location.href);
              url.searchParams.delete("credits");
              url.searchParams.delete("session_id");
              window.history.replaceState({}, "", url.pathname + url.search);
            } catch {
              /* ignore */
            }
            setConfirming(false);
            void refresh();
            return;
          }
          if (data.retry || data.status === "unpaid" || data.status === "processing") {
            await new Promise((r) => setTimeout(r, 1500 + i * 500));
            continue;
          }
          if (data.error) {
            setError(data.error);
            break;
          }
          await new Promise((r) => setTimeout(r, 1200));
        }
        setConfirming(false);
        void refresh();
      } catch (e) {
        if (!cancelled) {
          setConfirming(false);
          setError(e instanceof Error ? e.message : "Could not confirm payment");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [publicKey, refresh]);

  const buy = async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        url?: string;
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout");
      }
      if (data.sessionId) {
        try {
          sessionStorage.setItem("sol.new.credits.session", data.sessionId);
        } catch {
          /* ignore */
        }
      }
      window.location.assign(data.url);
    } catch (e) {
      setError(friendlyError(e, "Checkout failed."));
      setBusy(false);
    }
  };

  if (ok === null) {
    return (
      <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5 text-xs text-gray-500 flex items-center gap-2">
        <Spinner size={14} /> Checking credits…
      </div>
    );
  }
  if (!ok) return null;

  return (
    <div className="bg-violet-500/5 border border-violet-500/30 rounded-xl p-5 space-y-4 ring-1 ring-violet-500/15">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <DollarSign size={16} className="text-violet-500" /> Credits
        </p>
        <span className="text-[10px] uppercase tracking-wide font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
          Live · Stripe
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
        <strong className="font-semibold text-gray-800 dark:text-white/80">Live:</strong> buy{" "}
        <strong className="font-semibold">A$5</strong> sol.new credits with Apple Pay or card
        (Stripe). Digital credit for fees, links, and drops — not a crypto purchase.
      </p>

      <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3">
        <span className="text-xs text-gray-500 dark:text-white/40">Your balance</span>
        <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
          {balance.toLocaleString()}{" "}
          <span className="text-xs font-medium text-gray-400">credits</span>
        </span>
      </div>

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          {confirming ? <Spinner size={12} /> : <Check size={14} className="shrink-0" />}
          {confirming
            ? "Payment received — applying credits…"
            : balance > 0
              ? `Credits updated — balance ${balance.toLocaleString()}.`
              : "Payment received — refreshing balance…"}
        </div>
      )}

      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy || !publicKey || confirming}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer flex items-center justify-center gap-2 min-h-[48px] touch-manipulation active:scale-[0.98]"
      >
        {busy ? <Spinner size={16} /> : null}
        Buy A$5 credits — Apple Pay
      </button>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs space-y-1">
          <p>{error}</p>
          <button
            type="button"
            className="underline font-medium"
            onClick={() => {
              setError(null);
              void refresh();
            }}
          >
            Refresh balance
          </button>
        </div>
      )}
      <p className="text-[11px] text-gray-400 dark:text-white/30">
        Stripe live Checkout · A$5.00 · 500 credits · non-refundable
      </p>
    </div>
  );
}


export default function GetPage() {
  const { publicKey, refreshBalance, handleAirdrop, airdropping, airdropDone } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);


  const solscanUrl = publicKey
    ? `/address/${publicKey}`
    : "#";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="get SOL">
          <PageTransition>
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Download} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Get funds</h1>
              <p className="text-gray-500 dark:text-white/50">
                Receive SOL or USDC to your wallet.
              </p>
            </div>

            {/* Your address */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider">Your address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-purple-300 break-all">{publicKey}</code>
                <button
                  onClick={copyAddress}
                  className="shrink-0 p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Copy address"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-500 dark:text-white/50" />}
                </button>
              </div>
              {copied && <p className="text-xs text-green-400">Copied!</p>}
            </div>

            {/* QR Code */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider">Scan to send</p>
              <div className="bg-white rounded-xl p-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=solana:${publicKey}`}
                  alt="QR Code"
                  width={200}
                  height={200}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-white/30">Works with any Solana wallet</p>
            </div>

            {/* Devnet faucet */}
            {network === "devnet" && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Droplets size={18} className="text-yellow-400" />
                  <p className="font-semibold text-yellow-300">Devnet Faucet</p>
                </div>
                <p className="text-sm text-gray-500 dark:text-white/40">Get free devnet SOL for testing.</p>
                <button
                  onClick={handleAirdrop}
                  disabled={airdropping}
                  className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {airdropping ? "Sending..." : airdropDone ? <><Check className="w-4 h-4 inline" /> 0.1 SOL sent!</> : "Airdrop 0.1 SOL"}
                </button>
              </div>
            )}

            {/* Crossmint: fiat → USDC/SOL in wallet (FOMO-style) */}
            <CrossmintFundCard />

            {/* Optional sol.new app credits (Stripe) — secondary */}
            <details className="rounded-xl border border-black/10 dark:border-white/10 open:pb-0">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 flex items-center justify-between">
                <span>App credits (optional)</span>
                <span className="text-[10px] font-medium text-gray-400">A$5 Stripe</span>
              </summary>
              <div className="px-2 pb-2">
                <CreditsBuySection />
              </div>
            </details>

            {/* MoneyGram — sandbox/test only (devnet) */}
            {network === "devnet" && <MoneyGramRampsCard />}

            {/* View on explorer */}
            <a
              href={solscanUrl}
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-lg px-3.5 py-2.5 hover:text-gray-900 dark:hover:text-white transition text-center text-sm"
            >
              View on sol.new <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
            </a>
          </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
