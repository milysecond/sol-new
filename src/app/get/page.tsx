"use client";

import { useState, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Download, Copy, Check, Droplets, ExternalLink, QrCode } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";

export default function GetPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

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
      const data = await res.json();
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

  const solscanUrl = publicKey
    ? `https://solscan.io/account/${publicKey}${network === "devnet" ? "?cluster=devnet" : ""}`
    : "#";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ConnectGate action="get SOL">
          <div className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Download} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Get SOL</h1>
              <p className="text-white/50">Receive SOL or tokens to your wallet.</p>
            </div>

            {/* Your address */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
              <p className="text-xs text-white/40 uppercase tracking-wider">Your address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-purple-300 break-all">{publicKey}</code>
                <button
                  onClick={copyAddress}
                  className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
                  title="Copy address"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-white/50" />}
                </button>
              </div>
              {copied && <p className="text-xs text-green-400">Copied!</p>}
            </div>

            {/* QR Code */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="text-xs text-white/40 uppercase tracking-wider">Scan to send</p>
              <div className="bg-white rounded-xl p-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=solana:${publicKey}`}
                  alt="QR Code"
                  width={200}
                  height={200}
                />
              </div>
              <p className="text-xs text-white/30">Works with any Solana wallet</p>
            </div>

            {/* Devnet faucet */}
            {network === "devnet" && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Droplets size={18} className="text-yellow-400" />
                  <p className="font-semibold text-yellow-300">Devnet Faucet</p>
                </div>
                <p className="text-sm text-white/40">Get free devnet SOL for testing.</p>
                <button
                  onClick={handleAirdrop}
                  disabled={airdropping}
                  className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {airdropping ? "Sending..." : airdropDone ? "✓ 0.1 SOL sent!" : "Airdrop 0.1 SOL"}
                </button>
              </div>
            )}

            {/* Mainnet on-ramp */}
            {network === "mainnet" && (
              <div className="space-y-3">
                <p className="text-xs text-white/40 uppercase tracking-wider text-center">Buy SOL</p>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/onramp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: publicKey }) });
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank");
                  }}
                  className="w-full flex items-center justify-between bg-purple-500/10 border border-purple-400/30 rounded-xl px-5 py-4 hover:bg-purple-500/20 transition active:scale-[0.98] cursor-pointer text-left"
                >
                  <div>
                    <span className="font-medium block text-purple-300">Buy SOL</span>
                    <span className="text-xs text-white/40">Apple Pay · No KYC · From $5</span>
                  </div>
                  <ExternalLink size={16} className="text-purple-400/50" />
                </button>
                <p className="text-xs text-white/30 text-center">Powered by Coinbase · No account needed</p>
              </div>
            )}

            {/* View on explorer */}
            <a
              href={solscanUrl}
              target="_blank"
              className="block w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition text-center text-sm"
            >
              View on Solscan ↗
            </a>
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
