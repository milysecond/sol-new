"use client";

import { useState } from "react";

export default function Home() {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [launched, setLaunched] = useState(false);

  const handleLaunch = () => {
    if (!name || !ticker) return;
    setLaunched(true);
    setTimeout(() => setLaunched(false), 3000);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="text-xl font-bold tracking-tight">
          sol<span className="text-purple-400">.new</span>
        </div>
        <a
          href="https://solana.com"
          target="_blank"
          className="text-sm text-white/40 hover:text-white/70 transition"
        >
          Powered by Solana
        </a>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
              sol<span className="text-purple-400">.new</span>
            </h1>
            <p className="text-white/50 text-lg">
              Launch a Solana token in seconds.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Token name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Ticker (e.g. SOL)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono"
              />
            </div>
            <div>
              <label className="flex items-center justify-center w-full bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-6 cursor-pointer hover:border-white/20 transition">
                <span className="text-white/30 text-sm">
                  Upload image (optional)
                </span>
                <input type="file" accept="image/*" className="hidden" />
              </label>
            </div>
            <button
              onClick={handleLaunch}
              disabled={!name || !ticker}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {launched ? "Coming soon ✨" : "Launch token →"}
            </button>
          </div>

          {/* Info */}
          <div className="flex items-center justify-center gap-6 text-xs text-white/30">
            <span>No wallet needed</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>No fees</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Instant</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/10 text-center text-xs text-white/20">
        © 2025 sol.new
      </footer>
    </div>
  );
}
