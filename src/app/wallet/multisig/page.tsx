"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import Link from "next/link";

interface MultisigEntry {
  address: string;
  threshold: number;
  memberCount: number;
  vault: string;
  name: string | null;
  image: string | null;
}

export default function WalletMultisigPage() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [multisigs, setMultisigs] = useState<MultisigEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/multisig/on-chain?wallet=${publicKey}`)
      .then(r => r.json())
      .then(d => setMultisigs(d.multisigs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey, network]);


  return (
    <WalletShell>
      <PageTransition>
      {loading ? (
        <div className="text-center py-12"><Spinner size={24} className="text-purple-400 mx-auto" /></div>
      ) : multisigs.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-400 dark:text-white/30">No multisigs found</p>
          <Link href="/multisig" className="text-purple-400 hover:text-purple-300 text-sm transition">Create your first multisig</Link>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 dark:text-white/30">{multisigs.length} multisig{multisigs.length !== 1 ? "s" : ""} found</p>
          {multisigs.map((ms) => (
            <a
              key={ms.address}
              href={`https://app.squads.so/squads/${ms.vault}/home`}
              target="_blank"
              className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 hover:border-purple-400/30 transition cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck size={16} className="text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-sm font-semibold truncate">{ms.name || "Squad"}</p>
                  <p className="text-xs text-gray-400 dark:text-white/30 shrink-0">{ms.threshold}/{ms.memberCount}</p>
                </div>
                <p className="text-purple-400/50 text-[10px] font-mono truncate">{ms.vault}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 dark:text-white/20 shrink-0" />
            </a>
          ))}
        </div>
      )}
      </PageTransition>
    </WalletShell>
  );
}
