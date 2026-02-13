"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";

export default function TokenPage() {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [launched, setLaunched] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ConnectGate action="launch a token">
          <div className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="text-4xl">🪙</div>
              <h1 className="text-3xl font-bold tracking-tight">Launch a token</h1>
              <p className="text-white/50">Create your Solana token in one click.</p>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition" />
              <input type="text" placeholder="Ticker (e.g. SOL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={10} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono" />
              <input type="text" placeholder="Supply (default: 1,000,000,000)" value={supply} onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ""))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono" />
              <label className="flex items-center justify-center w-full bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-6 cursor-pointer hover:border-white/20 transition">
                <span className="text-white/30 text-sm">Upload image (optional)</span>
                <input type="file" accept="image/*" className="hidden" />
              </label>
              <button onClick={() => { if (!name || !ticker) return; setLaunched(true); setTimeout(() => setLaunched(false), 3000); }} disabled={!name || !ticker} className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed">
                {launched ? "Coming soon ✨" : "Launch token →"}
              </button>
            </div>
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
