"use client";

import { usePathname, useRouter } from "next/navigation";
import { Wallet, Download, CreditCard, Send, Image as ImageIcon, Coins, ShieldCheck, Copy, Check, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useState } from "react";
import { FaucetFooter } from "@/components/faucet-footer";

const tabs = [
  { id: "get", label: "Get", icon: Download, path: "/wallet/get" },
  { id: "pay", label: "Pay", icon: CreditCard, path: "/wallet/pay" },
  { id: "send", label: "Send", icon: Send, path: "/wallet/send" },
  { id: "token", label: "Tokens", icon: Coins, path: "/wallet/token" },
  { id: "nft", label: "NFTs", icon: ImageIcon, path: "/wallet/nft" },
  { id: "multisig", label: "Multisig", icon: ShieldCheck, path: "/wallet/multisig" },
];

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { publicKey, balance } = useWallet();
  const { network } = useNetwork();
  const pathname = usePathname();
  const router = useRouter();
  const [copiedAddress, setCopiedAddress] = useState(false);

  const clusterParam = network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true";
  const activeTab = tabs.find(t => pathname === t.path)?.id || "get";

  const copyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="view your wallet">
          <div className="w-full sm:max-w-lg space-y-3">
            {/* Header */}
            <div className="sticky top-0 z-30 flex items-center justify-between bg-white/95 dark:bg-black/95 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                  <Wallet size={20} className="text-fuchsia-400" />
                </div>
                <div className="min-w-0">
                  {balance !== null ? (
                    <p className="text-fuchsia-500 dark:text-fuchsia-400 font-mono font-bold text-lg leading-tight">{balance.toFixed(4)} SOL</p>
                  ) : (
                    <p className="text-fuchsia-500 dark:text-fuchsia-400 font-mono font-bold text-lg leading-tight flex items-center gap-2">
                      <Spinner size={16} className="text-fuchsia-400" />
                      <span className="text-sm font-normal opacity-60">fetching…</span>
                    </p>
                  )}
                  <p className="text-gray-400 dark:text-white/40 text-xs font-mono truncate">
                    {publicKey?.slice(0, 6)}...{publicKey?.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={copyAddress}
                  className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition"
                >
                  {copiedAddress ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-500 dark:text-white/50" />}
                </button>
                <a
                  href={`https://orbmarkets.io/address/${publicKey}${clusterParam}`}
                  target="_blank"
                  className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500 dark:text-white/50" />
                </a>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { try { navigator?.vibrate?.(10); } catch {} router.push(t.path); }}
                  className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-[11px] transition cursor-pointer active:scale-95 ${
                    activeTab === t.id
                      ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/50"
                      : "bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-black/10 dark:border-white/10"
                  }`}
                >
                  <t.icon size={16} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            {children}
          </div>
        </ConnectGate>
      </main>
      <FaucetFooter />
    </div>
  );
}
