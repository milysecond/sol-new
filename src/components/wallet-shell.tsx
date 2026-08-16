"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Wallet,
  Download,
  CreditCard,
  Send,
  Image as ImageIcon,
  Coins,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Settings,
} from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { FaucetFooter } from "@/components/faucet-footer";
import { formatSol, useHideBalances } from "@/lib/privacy";
import { addressPath, EXPLORER_LABEL } from "@/lib/explorer";

const tabs = [
  { id: "get", label: "Get", icon: Download, path: "/wallet/get" },
  { id: "pay", label: "Pay", icon: CreditCard, path: "/wallet/pay" },
  { id: "send", label: "Send", icon: Send, path: "/wallet/send" },
  { id: "token", label: "Tokens", icon: Coins, path: "/wallet/token" },
  { id: "nft", label: "NFTs", icon: ImageIcon, path: "/wallet/nft" },
  { id: "multisig", label: "Multi", icon: ShieldCheck, path: "/wallet/multisig" },
  { id: "settings", label: "Settings", icon: Settings, path: "/wallet/settings" },
];

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { publicKey, balance } = useWallet();
  const pathname = usePathname();
  const router = useRouter();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [hideBalances] = useHideBalances();

  const activeTab =
    tabs.find((t) => pathname === t.path || pathname?.startsWith(t.path + "/"))
      ?.id || "get";

  const copyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const balLabel =
    balance === null ? null : formatSol(hideBalances, balance, 4);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="view your wallet">
          <div className="w-full sm:max-w-lg space-y-3">
            <div className="sticky top-0 z-20 flex items-center justify-between bg-white/95 dark:bg-black/95 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                  <Wallet size={20} className="text-fuchsia-400" />
                </div>
                <div className="min-w-0">
                  {balLabel !== null ? (
                    <p className="text-fuchsia-500 dark:text-fuchsia-400 font-mono font-bold text-lg leading-tight">
                      {balLabel}
                    </p>
                  ) : (
                    <p className="text-fuchsia-500 dark:text-fuchsia-400 font-mono font-bold text-lg leading-tight flex items-center gap-2">
                      <Spinner size={16} className="text-fuchsia-400" />
                      <span className="text-sm font-normal opacity-60">
                        fetching…
                      </span>
                    </p>
                  )}
                  <p className="text-gray-400 dark:text-white/40 text-xs font-mono truncate">
                    {publicKey?.slice(0, 6)}...{publicKey?.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {/* Settings only via tab row below — no duplicate gear */}
                <button
                  type="button"
                  onClick={copyAddress}
                  className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition"
                  title="Copy address"
                  aria-label="Copy address"
                >
                  {copiedAddress ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-500 dark:text-white/50" />
                  )}
                </button>
                {publicKey && (
                  <Link
                    href={addressPath(publicKey)}
                    className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition"
                    title={EXPLORER_LABEL}
                    aria-label={EXPLORER_LABEL}
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500 dark:text-white/50" />
                  </Link>
                )}
              </div>
            </div>

            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    try {
                      navigator?.vibrate?.(10);
                    } catch {
                      /* ignore */
                    }
                    router.push(t.path);
                  }}
                  className={`flex-1 min-w-[3.1rem] flex flex-col items-center gap-1 px-1.5 py-2 rounded-xl text-[10px] sm:text-[11px] transition cursor-pointer active:scale-95 ${
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

            {children}
          </div>
        </ConnectGate>
      </main>
      <FaucetFooter />
    </div>
  );
}
