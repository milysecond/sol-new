"use client";

import { useState, useCallback } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Download, Copy, Check, Droplets, ExternalLink, Apple } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { friendlyError } from "@/lib/friendly-errors";

const ONRAMP_ENABLED = process.env.NEXT_PUBLIC_ONRAMP_ENABLED === "1";

export default function GetPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

  // Apple Pay form — kept under $150 to stay in MoonPay's no-KYC tier
  const [amount, setAmount] = useState(25);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  const handleAirdrop = useCallback(async () => {
    if (!publicKey || network !== "devnet") return;
    setAirdropping(true);
    setAirdropDone(false);
    try {
      const res = await fetch("/api/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        await refreshBalance();
        setAirdropDone(true);
        setTimeout(() => setAirdropDone(false), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setAirdropping(false);
    }
  }, [publicKey, network, refreshBalance]);

  const buyWithApplePay = async () => {
    if (!publicKey) return;
    setBuyError(null);
    setBuying(true);
    try {
      const res = await fetch("/api/onramp/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey, amount }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to start payment");
      window.location.href = data.url;
    } catch (e) {
      setBuyError(friendlyError(e, "Couldn't start payment. Try again."));
      setBuying(false);
    }
  };

  const isValid = amount >= 20 && amount <= 150;

  const solscanUrl = publicKey
    ? `https://orbmarkets.io/address/${publicKey}${network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true"}`
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
              <h1 className="text-3xl font-bold tracking-tight">Get SOL</h1>
              <p className="text-gray-500 dark:text-white/50">Receive SOL or tokens to your wallet.</p>
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

            {/* Mainnet on-ramp — direct Apple Pay */}
            {ONRAMP_ENABLED && network === "mainnet" && (
              <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Apple size={16} className="inline" /> Buy with Apple Pay
                  </p>
                  <span className="text-xs text-gray-400 dark:text-white/30">no signup</span>
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-white/40 mb-1.5 block">Amount</label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[20, 50, 100, 150].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAmount(n)}
                        className={`rounded-lg py-2 text-sm font-medium transition cursor-pointer ${
                          amount === n
                            ? "bg-purple-500/20 border border-purple-400/50 text-purple-400"
                            : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        ${n}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30">$</span>
                    <input
                      type="number"
                      min={20}
                      max={150}
                      value={amount}
                      onChange={(e) => setAmount(Math.max(20, Math.min(150, parseInt(e.target.value) || 20)))}
                      className="w-full pl-7 pr-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white focus:outline-none focus:border-purple-400/50 text-sm tabular-nums"
                    />
                  </div>
                </div>

                {buyError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">{buyError}</div>
                )}

                <button
                  onClick={buyWithApplePay}
                  disabled={!isValid || buying}
                  className="w-full flex items-center justify-center gap-2 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl px-5 py-3 hover:bg-black/85 dark:hover:bg-white/85 transition active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {buying ? "Starting…" : <><Apple size={18} className="inline" /> Pay ${amount}</>}
                </button>
                <p className="text-[10px] text-gray-400 dark:text-white/30 text-center leading-snug">
                  Processed by Banxa. Card, Apple Pay &amp; more. SOL arrives within minutes.
                </p>
              </div>
            )}

            {/* View on explorer */}
            <a
              href={solscanUrl}
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition text-center text-sm"
            >
              View on Orb Markets <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
            </a>
          </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
