"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useState, useCallback } from "react";

const NAV_ITEMS = [
  { href: "/token", label: "Token", emoji: "🪙" },
  { href: "/nft", label: "NFT", emoji: "🖼️" },
  { href: "/pay", label: "Pay", emoji: "💸" },
  { href: "/multisig", label: "Multisig", emoji: "🏛️" },
];

export function Navbar() {
  const { publicKey, balance, connect, recover, disconnect, loading, refreshBalance } = useWallet();
  const { network, rpc, toggle } = useNetwork();
  const [showMenu, setShowMenu] = useState(false);
  const [airdropping, setAirdropping] = useState(false);

  const handleAirdrop = useCallback(async () => {
    if (!publicKey || network !== "devnet") return;
    setAirdropping(true);
    try {
      await fetch("/api/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      // Wait for confirmation to propagate
      await new Promise((r) => setTimeout(r, 2000));
      await refreshBalance();
    } catch {
      // silently fail
    } finally {
      setAirdropping(false);
    }
  }, [publicKey, network, refreshBalance]);
  const pathname = usePathname();

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;

  return (
    <nav className="border-b border-white/10">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            sol<span className="text-purple-400">.new</span>
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pathname === item.href
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                }`}
              >
                <span className="mr-1.5">{item.emoji}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition cursor-pointer"
            title={`Switch to ${network === "mainnet" ? "devnet" : "mainnet"}`}
          >
            <span className={`w-2 h-2 rounded-full ${network === "mainnet" ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className="hidden sm:inline">{network === "mainnet" ? "mainnet" : "devnet"}</span>
          </button>
          {publicKey ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm hover:border-purple-400/30 transition cursor-pointer"
              >
                {balance !== null && (
                  <span className="text-purple-400 font-mono">{balance.toFixed(4)} SOL</span>
                )}
                <span className="text-white/60 font-mono">{shortKey}</span>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-20 bg-black border border-white/10 rounded-xl overflow-hidden min-w-[200px]">
                    <div className="px-4 py-3 border-b border-white/10">
                      <p className="text-xs text-white/40">Wallet</p>
                      <p className="text-xs font-mono text-white/60 break-all mt-1">{publicKey}</p>
                    </div>
                    <Link
                      href="/wallet"
                      onClick={() => setShowMenu(false)}
                      className="block px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition"
                    >
                      👛 Wallet details
                    </Link>
                    <a
                      href={`https://solscan.io/account/${publicKey}${network === "devnet" ? "?cluster=devnet" : ""}`}
                      target="_blank"
                      className="block px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition"
                    >
                      View on Solscan ↗
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publicKey);
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition cursor-pointer"
                    >
                      Copy address
                    </button>
                    {network === "devnet" && (
                      <button
                        onClick={() => { handleAirdrop(); setShowMenu(false); }}
                        disabled={airdropping}
                        className="block w-full text-left px-4 py-2.5 text-sm text-yellow-400 hover:bg-white/5 transition cursor-pointer disabled:opacity-50"
                      >
                        {airdropping ? "Airdropping..." : "💧 Airdrop 0.1 SOL"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        disconnect();
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={connect}
                disabled={loading}
                className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium rounded-xl px-4 py-2 transition cursor-pointer disabled:opacity-50"
              >
                {loading ? "..." : "Connect"}
              </button>
              <button
                onClick={recover}
                disabled={loading}
                className="bg-white/5 border border-white/10 text-white/60 text-sm rounded-xl px-3 py-2 hover:text-white transition cursor-pointer disabled:opacity-50 hidden sm:block"
              >
                Recover
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex sm:hidden items-center gap-1 px-4 pb-3 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
              pathname === item.href
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <span className="mr-1">{item.emoji}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
