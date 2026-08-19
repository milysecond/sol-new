"use client";

import { useState, useCallback, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { MoneyGramRampsCard } from "@/components/moneygram-ramps";
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

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("credits") === "success") {
        setSuccess(true);
        const sid = q.get("session_id");
        if (sid && publicKey) {
          void fetch("/api/credits/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid, wallet: publicKey }),
          }).then(() => refresh());
        } else {
          void refresh();
        }
      }
    } catch {
      /* ignore */
    }
  }, [refresh, publicKey]);

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
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout");
      }
      // Same-tab for Apple Pay on iOS Safari
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
        <strong className="font-semibold">A$5</strong> sol.new credits with Apple Pay or card (Stripe).
        Digital credit for fees, links, and drops — not a crypto purchase.
      </p>

      <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3">
        <span className="text-xs text-gray-500 dark:text-white/40">Your balance</span>
        <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
          {balance.toLocaleString()}{" "}
          <span className="text-xs font-medium text-gray-400">credits</span>
        </span>
      </div>

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 text-xs">
          Payment received — credits will appear within a few seconds. Pull to refresh if needed.
        </div>
      )}

      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy || !publicKey}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer flex items-center justify-center gap-2"
      >
        {busy ? <Spinner size={16} /> : null}
        Buy A$5 credits — Apple Pay
      </button>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">
          {error}
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
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="get SOL">
          <PageTransition>
          <div className="w-full sm:max-w-lg space-y-8">
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
                  className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {airdropping ? "Sending..." : airdropDone ? <><Check className="w-4 h-4 inline" /> 0.1 SOL sent!</> : "Airdrop 0.1 SOL"}
                </button>
              </div>
            )}

            {/* Stripe live credits — mainnet only */}
            {network === "mainnet" && <CreditsBuySection />}

            {/* MoneyGram Ramps — live on mainnet when approved; sandbox on devnet */}
            <MoneyGramRampsCard />

            {/* View on explorer */}
            <a
              href={solscanUrl}
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition text-center text-sm"
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
