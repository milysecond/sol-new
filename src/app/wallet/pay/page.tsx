"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useDefaultToken } from "@/lib/currency-pref";
import QRCode from "qrcode";

const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAY_TOKENS = ["SOL", "USDC"] as const;

function buildSolanaPayUrl(recipient: string, amount: string, token: string, label: string, network: string) {
  const base = `solana:${recipient}`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", amount);
  if (label) params.set("label", label);
  if (token === "USDC") params.set("spl-token", network === "devnet" ? USDC_DEVNET : USDC_MAINNET);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function WalletPayPage() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [defaultToken] = useDefaultToken();
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState("SOL");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSelected(defaultToken);
  }, [defaultToken]);

  const handleCreate = () => {
    if (!amount || !publicKey) return;
    setPayUrl(buildSolanaPayUrl(publicKey, amount, selected, label, network));
  };

  useEffect(() => {
    if (!payUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payUrl, { width: 256, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
  }, [payUrl]);

  const copyLink = () => {
    if (!payUrl) return;
    navigator.clipboard.writeText(payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  return (
    <WalletShell>
      <PageTransition>
      {payUrl ? (
        <div className="space-y-3">
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center space-y-4">
            <canvas ref={canvasRef} className="rounded-xl" />
            <p className="text-gray-900 dark:text-white font-semibold text-lg">{amount} {selected}</p>
            {label && <p className="text-gray-500 dark:text-white/40 text-sm">{label}</p>}
            <div onClick={copyLink} className="w-full bg-black/5 dark:bg-white/5 rounded-lg px-4 py-3 font-mono text-xs text-gray-500 dark:text-white/50 break-all cursor-pointer hover:text-gray-700 dark:hover:text-white/70 transition">{payUrl}</div>
            <button onClick={copyLink} className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5">{copied ? <><Check className="w-4 h-4 inline" /> Copied!</> : "Copy link"}</button>
          </div>
          <button onClick={() => { setPayUrl(null); setAmount(""); setLabel(""); setCopied(false); }} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-lg px-3.5 py-2.5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer">Create another</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-gray-500 dark:text-white/50 text-sm">Create a Solana Pay link anyone can pay with.</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono">{selected === "SOL" ? "◎" : "$"}</span>
            <input type="text" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400/50 focus:ring-1 focus:ring-fuchsia-400/25 transition font-mono text-2xl" />
          </div>
          <input type="text" placeholder="What's it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400/50 focus:ring-1 focus:ring-fuchsia-400/25 transition" />
          <div className="flex gap-2">
            {PAY_TOKENS.map((token) => (
              <button key={token} onClick={() => setSelected(token)} className={`flex-1 border rounded-lg px-3 py-2 text-sm transition cursor-pointer ${selected === token ? "bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-300" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"}`}>{token}</button>
            ))}
          </div>
          <button onClick={handleCreate} disabled={!amount} className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed">Create {selected} link</button>
        </div>
      )}
      </PageTransition>
    </WalletShell>
  );
}
