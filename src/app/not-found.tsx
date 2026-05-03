"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { Sparkles, ArrowRight, Coins } from "lucide-react";

const QUIPS = [
  "off-chain.",
  "never minted.",
  "rugged from the URL bar.",
  "a phantom address.",
  "404 lamports short.",
  "lost to the void.",
  "burned before deploy.",
];

export default function NotFound() {
  const [quip, setQuip] = useState(QUIPS[0]);

  useEffect(() => {
    setQuip(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
  }, []);

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="space-y-8 max-w-md w-full">
          <div className="relative inline-block">
            <img
              src="/icon-512.png"
              alt="sol.new"
              className="w-20 h-20 mx-auto rounded-2xl electrify opacity-60 grayscale"
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-7xl sm:text-8xl font-bold tracking-tight leading-none">
              <span className="text-purple-400">4</span>
              <span className="text-orange-400">0</span>
              <span className="text-purple-400">4</span>
            </h1>
            <p className="text-base sm:text-lg text-gray-500 dark:text-white/50">
              This page is{" "}
              <span className="text-gray-900 dark:text-white font-medium">{quip}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Link
              href="/"
              className="group flex flex-col items-center justify-center gap-1.5 py-4 bg-purple-500/10 hover:bg-purple-500/15 border border-purple-400/30 rounded-2xl transition active:scale-95"
            >
              <ArrowRight className="w-4 h-4 text-purple-400 -rotate-180 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm font-semibold text-purple-400">Home</span>
            </Link>
            <Link
              href="/whats-new"
              className="group flex flex-col items-center justify-center gap-1.5 py-4 bg-orange-500/10 hover:bg-orange-500/15 border border-orange-400/30 rounded-2xl transition active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-orange-400">What's new</span>
            </Link>
            <Link
              href="/token"
              className="group flex flex-col items-center justify-center gap-1.5 py-4 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] border border-black/10 dark:border-white/10 rounded-2xl transition active:scale-95"
            >
              <Coins className="w-4 h-4 text-gray-700 dark:text-white/70" />
              <span className="text-sm font-semibold text-gray-700 dark:text-white/70">Launch one</span>
            </Link>
          </div>

          <p className="text-xs text-gray-400 dark:text-white/30">
            sol<span className="text-purple-400">.new</span> · Create anything on Solana
          </p>
        </div>
      </main>
    </div>
  );
}
