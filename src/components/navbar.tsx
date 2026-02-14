"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useState, useCallback } from "react";
import { Coins, Image, Download, CreditCard, ShieldCheck, FolderOpen, Wallet, Droplets, Zap, ExternalLink, Copy, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { LucideIcon } from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/token", label: "Token", icon: Coins },
  { href: "/nft", label: "NFT", icon: Image },
  { href: "/multisig", label: "Multisig", icon: ShieldCheck },
  { href: "/wallet/get", label: "Wallet", icon: Wallet },
];

export function Navbar() {
  const { publicKey, balance, connect, recover, disconnect, loading, airdropping, airdropDone, handleAirdrop } = useWallet();
  const { network, rpc, toggle } = useNetwork();
  const [showMenu, setShowMenu] = useState(false);
  const pathname = usePathname();

  const shortKey = publicKey ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` : null;

  return (
    <nav className="border-b border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src="/icon-192.png" alt="sol.new" className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg" />
            <span className="text-lg sm:text-xl font-bold tracking-tight hidden sm:inline">sol<span className="text-purple-400">.new</span></span>
          </Link>
          <button
            onClick={toggle}
            className="cursor-pointer"
            title={`Switch to ${network === "mainnet" ? "devnet" : "mainnet"}`}
          >
            {network === "devnet" ? (
              <span className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-1.5 py-0.5">test mode</span>
            ) : (
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-1.5 py-0.5">live</span>
            )}
          </button>
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pathname === item.href || (item.href.startsWith("/wallet") && pathname.startsWith("/wallet"))
                    ? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <item.icon size={16} className="inline mr-1.5" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <a href="https://x.com/soldotnew" target="_blank" className="text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition" title="X">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </a>
          <a href="https://t.me/soldotnew" target="_blank" className="text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition" title="Telegram">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </a>
          <ThemeToggle />
          {publicKey ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-1.5 sm:gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-2 sm:px-3 py-2 text-xs sm:text-sm hover:border-purple-400/30 transition cursor-pointer"
              >
                <Wallet size={14} className="text-purple-400 sm:hidden" />
                {balance !== null && (
                  <span className="text-purple-400 font-mono hidden sm:inline">{balance.toFixed(4)} SOL</span>
                )}
                <span className="text-gray-600 dark:text-white/60 font-mono">{shortKey}</span>
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl overflow-hidden min-w-[200px] shadow-lg">
                    <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
                      <p className="text-xs text-gray-500 dark:text-white/40">Wallet</p>
                      <p className="text-xs font-mono text-gray-600 dark:text-white/60 break-all mt-1">{publicKey}</p>
                      {balance !== null && (
                        <p className="text-sm font-mono text-purple-400 mt-2">{balance.toFixed(4)} SOL</p>
                      )}
                    </div>
                    <Link
                      href="/wallet"
                      onClick={() => setShowMenu(false)}
                      className="block px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      <Wallet size={14} className="inline mr-1.5" /> Wallet details
                    </Link>
                    <a
                      href={`https://orbmarkets.io/address/${publicKey}${network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true"}`}
                      target="_blank"
                      className="block px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      <ExternalLink size={14} className="inline mr-1.5" /> View on Orb
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publicKey);
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                    >
                      <Copy size={14} className="inline mr-1.5" /> Copy address
                    </button>
                    {network === "devnet" && (
                      <button
                        onClick={() => { handleAirdrop(); setShowMenu(false); }}
                        disabled={airdropping}
                        className="block w-full text-left px-4 py-2.5 text-sm text-yellow-400 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer disabled:opacity-50"
                      >
                        {airdropping ? "Airdropping..." : airdropDone ? <><Zap size={14} className="inline mr-1" /> 0.1 SOL sent!</> : <><Droplets size={14} className="inline mr-1" /> Airdrop 0.1 SOL</>}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        disconnect();
                        setShowMenu(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
                    >
                      <LogOut size={14} className="inline mr-1.5" /> Disconnect
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
                className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 text-sm rounded-xl px-3 py-2 hover:text-gray-900 dark:hover:text-white transition cursor-pointer disabled:opacity-50 hidden sm:block"
              >
                Recover
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom nav — fixed */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white/95 dark:bg-black/95 backdrop-blur border-t border-black/10 dark:border-white/10 flex items-center justify-around px-2 py-2 safe-bottom">
        {[{ href: "/", label: "Home", icon: Zap }, ...NAV_ITEMS].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] transition active:scale-95 ${
              pathname === item.href || (item.href.startsWith("/wallet") && pathname.startsWith("/wallet"))
                ? "text-purple-400"
                : "text-gray-500 dark:text-white/40 active:text-gray-700 dark:active:text-white/70"
            }`}
          >
            <item.icon size={20} className="" />
            <span className="text-[10px]">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
