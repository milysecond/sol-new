"use client";

import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { useWallet } from "@/lib/wallet-context";
import { FaucetFooter } from "@/components/faucet-footer";

const products = [
  { href: "/token", emoji: "🪙", title: "Token", desc: "Launch a token in seconds" },
  { href: "/nft", emoji: "🖼️", title: "NFT", desc: "Mint an NFT from any image" },
  { href: "/pay", emoji: "💸", title: "Pay", desc: "Create a payment link" },
  { href: "/multisig", emoji: "🏛️", title: "Multisig", desc: "Create a multisig" },
];

export default function Home() {
  const { publicKey, connect, loading } = useWallet();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
              sol<span className="text-purple-400">.new</span>
            </h1>
            <p className="text-white/50 text-lg max-w-md mx-auto">
              Create anything on Solana. No wallet app, no seed phrase, no friction.
            </p>
            {!publicKey && (
              <button
                onClick={connect}
                disabled={loading}
                className="mt-2 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-8 py-3 transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "Authenticating..." : "Get started →"}
              </button>
            )}
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
                  <div className="font-semibold text-white group-hover:text-purple-300 transition">{p.title}</div>
                  <div className="text-sm text-white/40">{p.desc}</div>
                </div>
                <span className="text-white/20 group-hover:text-white/40 transition">→</span>
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
      <FaucetFooter />
      <footer className="px-6 py-4 border-t border-white/10 text-center text-xs text-white/20">© 2025 sol.new</footer>
    </div>
  );
}
