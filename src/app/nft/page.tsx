"use client";

import { useState } from "react";
import Link from "next/link";

export default function NftPage() {
  const [name, setName] = useState("");
  const [minted, setMinted] = useState(false);

  const handleMint = () => {
    if (!name) return;
    setMinted(true);
    setTimeout(() => setMinted(false), 3000);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="text-xl font-bold tracking-tight">
          sol<span className="text-purple-400">.new</span>
        </Link>
        <span className="text-sm text-white/40">NFT</span>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="text-4xl">🖼️</div>
            <h1 className="text-3xl font-bold tracking-tight">Mint an NFT</h1>
            <p className="text-white/50">Turn any image into a Solana NFT.</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="NFT name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
            />
            <textarea
              placeholder="Description (optional)"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition resize-none"
            />
            <label className="flex flex-col items-center justify-center w-full bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-10 cursor-pointer hover:border-white/20 transition">
              <span className="text-2xl mb-2">📎</span>
              <span className="text-white/30 text-sm">Drop an image or click to upload</span>
              <input type="file" accept="image/*" className="hidden" />
            </label>
            <button
              onClick={handleMint}
              disabled={!name}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {minted ? "Coming soon ✨" : "Mint NFT →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
