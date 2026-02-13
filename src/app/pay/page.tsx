"use client";

import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import QRCode from "qrcode";

const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const TOKENS = ["SOL", "USDC"];

function buildSolanaPayUrl(recipient: string, amount: string, token: string, label: string, network: string) {
  const base = `solana:${recipient}`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", amount);
  if (label) params.set("label", label);
  if (token === "USDC") {
    params.set("spl-token", network === "devnet" ? USDC_DEVNET : USDC_MAINNET);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function PayPage() {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState("SOL");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { publicKey } = useWallet();
  const { network } = useNetwork();

  const handleCreate = () => {
    if (!amount || !publicKey) return;
    const url = buildSolanaPayUrl(publicKey, amount, selected, label, network);
    setPayUrl(url);
  };

  useEffect(() => {
    if (!payUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#ffffffee", light: "#00000000" },
    });
  }, [payUrl]);

  const copyLink = () => {
    if (!payUrl) return;
    navigator.clipboard.writeText(payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setPayUrl(null);
    setAmount("");
    setLabel("");
    setCopied(false);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ConnectGate action="create a payment link">
          <div className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="text-4xl">💸</div>
              <h1 className="text-3xl font-bold tracking-tight">Payment link</h1>
              <p className="text-white/50">Create a Solana Pay link anyone can pay with.</p>
            </div>

            {payUrl ? (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center space-y-4">
                  <canvas ref={canvasRef} className="rounded-xl" />
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">
                      {amount} {selected}
                    </p>
                    {label && <p className="text-white/40 text-sm">{label}</p>}
                  </div>
                  <div
                    onClick={copyLink}
                    className="w-full bg-black/50 rounded-lg px-4 py-3 font-mono text-xs text-white/50 break-all cursor-pointer hover:text-white/70 transition"
                  >
                    {payUrl}
                  </div>
                  <button
                    onClick={copyLink}
                    className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer"
                  >
                    {copied ? "Copied! ✓" : "Copy link"}
                  </button>
                </div>
                <button
                  onClick={reset}
                  className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer"
                >
                  Create another →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-mono">
                    {selected === "SOL" ? "◎" : "$"}
                  </span>
                  <input type="text" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono text-2xl" />
                </div>
                <input type="text" placeholder="What's it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition" />
                <div className="flex gap-2">
                  {TOKENS.map((token) => (
                    <button
                      key={token}
                      onClick={() => setSelected(token)}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                        selected === token
                          ? "bg-purple-500/20 border-purple-400/50 text-purple-300"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {token}
                    </button>
                  ))}
                </div>
                <button onClick={handleCreate} disabled={!amount} className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed">
                  Create {selected} link →
                </button>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
