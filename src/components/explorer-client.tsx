"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import {
  Search,
  Wallet,
  Receipt,
  Coins,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { classifyExplorerQuery } from "@/lib/explorer";
import { useWallet } from "@/lib/wallet-context";

const SHORTCUTS = [
  {
    href: "/address",
    label: "Address",
    desc: "Wallet, mint, or program",
    icon: Wallet,
  },
  {
    href: "/receipt",
    label: "Receipt",
    desc: "Transaction signature",
    icon: Receipt,
  },
  {
    href: "/token",
    label: "Token",
    desc: "Launch or open a mint",
    icon: Coins,
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    desc: "Balances + DeFi",
    icon: Activity,
  },
] as const;

function ExplorerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey } = useWallet();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial =
      searchParams.get("q") ||
      searchParams.get("query") ||
      searchParams.get("address") ||
      searchParams.get("tx") ||
      "";
    if (initial) {
      setQ(initial);
      const hit = classifyExplorerQuery(initial);
      if (hit) router.replace(hit.href);
    }
  }, [searchParams, router]);

  const go = () => {
    const hit = classifyExplorerQuery(q);
    if (!hit) {
      setError("Paste a Solana address or transaction signature");
      return;
    }
    setError(null);
    router.push(hit.href);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full pb-24">
        <PageTransition>
          <div className="app-shell py-8 sm:py-12 space-y-8">
            <div className="text-center space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-rose-500 font-semibold">
                Explorer
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                sol.new explorer
              </h1>
              <p className="text-sm text-gray-500 dark:text-white/45 max-w-md mx-auto">
                Look up wallets, tokens, programs, and transactions — all in-app.
                No Solscan.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") go();
                    }}
                    placeholder="Address, mint, or tx signature"
                    className="w-full pl-10 pr-3 py-3.5 min-h-[52px] rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={go}
                  disabled={!q.trim()}
                  className="min-h-[52px] px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  Go <ArrowRight size={16} />
                </button>
              </div>
              {error && <p className="text-xs text-rose-500 px-1">{error}</p>}
              <p className="text-[11px] text-gray-400 dark:text-white/30 px-1">
                Tip: paste a full Solscan/explorer URL — we route it in-app.
              </p>
            </div>

            {publicKey && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Your wallet</p>
                  <p className="font-mono text-xs truncate">{publicKey}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/address/${publicKey}`}
                    className="text-xs font-semibold px-3 py-2 rounded-xl bg-rose-600 text-white"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/portfolio/${publicKey}`}
                    className="text-xs font-semibold px-3 py-2 rounded-xl border border-black/10 dark:border-white/10"
                  >
                    Portfolio
                  </Link>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {SHORTCUTS.map(({ href, label, desc, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 hover:border-rose-500/40 transition space-y-2"
                >
                  <Icon className="w-5 h-5 text-rose-500" />
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-white/40">{desc}</p>
                </Link>
              ))}
            </div>

            <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-2 text-sm">
              <p className="font-semibold">Canonical URLs</p>
              <ul className="space-y-1.5 text-xs font-mono text-gray-500 dark:text-white/45">
                <li>
                  <span className="text-rose-500">/address/</span>
                  {"{pubkey}"}
                </li>
                <li>
                  <span className="text-rose-500">/receipt/</span>
                  {"{signature}"}
                </li>
                <li>
                  <span className="text-rose-500">/token/</span>
                  {"{mint}"}
                </li>
                <li>
                  <span className="text-rose-500">/explorer/tx/</span>
                  {"{signature}"}
                  <span className="text-gray-400"> → receipt</span>
                </li>
                <li>
                  <span className="text-rose-500">/explorer/address/</span>
                  {"{pubkey}"}
                </li>
                <li>
                  <span className="text-rose-500">/explorer/token/</span>
                  {"{mint}"}
                </li>
              </ul>
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

export function ExplorerClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center text-sm text-gray-500">
          Loading explorer…
        </div>
      }
    >
      <ExplorerInner />
    </Suspense>
  );
}
