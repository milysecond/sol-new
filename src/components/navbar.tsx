"use client";

import Link from "next/link";
import { useWallet } from "@/lib/wallet-context";
import { useState } from "react";

export function Navbar({ label }: { label?: string }) {
  const { publicKey, balance, connect, recover, disconnect, loading } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          sol<span className="text-purple-400">.new</span>
        </Link>
        {label && <span className="text-sm text-white/40">{label}</span>}
      </div>

      <div className="flex items-center gap-3">
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
                  <a
                    href={`https://solscan.io/account/${publicKey}`}
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
              className="bg-white/5 border border-white/10 text-white/60 text-sm rounded-xl px-3 py-2 hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              Recover
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
