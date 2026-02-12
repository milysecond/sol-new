"use client";

import Link from "next/link";

const products = [
  {
    href: "/token",
    emoji: "🪙",
    title: "Token",
    desc: "Launch a token in seconds",
    tag: "sol.new/token",
  },
  {
    href: "/nft",
    emoji: "🖼️",
    title: "NFT",
    desc: "Mint an NFT from any image",
    tag: "sol.new/nft",
  },
  {
    href: "/wallet",
    emoji: "👛",
    title: "Wallet",
    desc: "Instant wallet, no install",
    tag: "sol.new/wallet",
  },
  {
    href: "/pay",
    emoji: "💸",
    title: "Pay",
    desc: "Create a payment link",
    tag: "sol.new/pay",
  },
  {
    href: "/dao",
    emoji: "🏛️",
    title: "DAO",
    desc: "Spin up a multisig",
    tag: "sol.new/dao",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
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

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full space-y-12">
          <div className="text-center space-y-3">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
              sol<span className="text-purple-400">.new</span>
            </h1>
            <p className="text-white/50 text-lg max-w-md mx-auto">
              Create anything on Solana. No wallet, no fees, no friction.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {products.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group flex items-center gap-4 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-purple-400/30 rounded-2xl px-5 py-4 transition"
              >
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white group-hover:text-purple-300 transition">
                    {p.title}
                  </div>
                  <div className="text-sm text-white/40">{p.desc}</div>
                </div>
                <span className="text-xs text-white/20 font-mono hidden sm:block">
                  {p.tag}
                </span>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-white/30">
            <span>No wallet needed</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>No fees</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Instant</span>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-white/10 text-center text-xs text-white/20">
        © 2025 sol.new
      </footer>
    </div>
  );
}
