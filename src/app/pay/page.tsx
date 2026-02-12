"use client";

import { useState } from "react";
import Link from "next/link";

export default function PayPage() {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="text-xl font-bold tracking-tight">
          sol<span className="text-purple-400">.new</span>
        </Link>
        <span className="text-sm text-white/40">Pay</span>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="text-4xl">💸</div>
            <h1 className="text-3xl font-bold tracking-tight">Payment link</h1>
            <p className="text-white/50">Create a Solana Pay link anyone can pay with.</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-mono">$</span>
              <input
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono text-2xl"
              />
            </div>
            <input
              type="text"
              placeholder="What's it for? (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
            />
            <div className="flex gap-2">
              {["SOL", "USDC"].map((token) => (
                <button
                  key={token}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white hover:border-purple-400/30 transition cursor-pointer"
                >
                  {token}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (!amount) return;
                setCreated(true);
                setTimeout(() => setCreated(false), 3000);
              }}
              disabled={!amount}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {created ? "Coming soon ✨" : "Create link →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
