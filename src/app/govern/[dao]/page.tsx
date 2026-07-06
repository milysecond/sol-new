"use client";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Vote, ExternalLink, Copy, Check } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { useState } from "react";

export default function GovernPage() {
  const { dao } = useParams<{ dao: string }>();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(dao).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <PageTransition>
          <div className="w-full sm:max-w-lg space-y-5">
            <div className="text-center space-y-2">
              <AnimatedIcon icon={Vote} size={32} className="text-green-400" />
              <h1 className="text-2xl font-bold tracking-tight">Futarchy DAO created</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">Your DAO is live on Solana.</p>
            </div>

            <div className="bg-green-500/5 border border-green-400/20 rounded-xl p-4 space-y-2">
              <p className="text-xs text-gray-500 dark:text-white/40">DAO address</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm text-gray-900 dark:text-white break-all flex-1">{dao}</p>
                <button onClick={copy} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer">
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                </button>
              </div>
            </div>

            <div className="space-y-3 text-sm text-gray-600 dark:text-white/60">
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-2">
                <p className="font-semibold text-gray-900 dark:text-white">What&apos;s next</p>
                <ul className="space-y-1.5 list-disc pl-4">
                  <li>Add liquidity to the USDC prediction market AMMs so proposals can be created.</li>
                  <li>Open MetaDAO to create your first proposal.</li>
                  <li>Share your DAO address so token holders can participate.</li>
                </ul>
              </div>
            </div>

            <a
              href={`https://metadao.fi/dao/${dao}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl px-4 py-3.5 transition"
            >
              Open on MetaDAO <ExternalLink size={15} />
            </a>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
