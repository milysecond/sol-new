"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ChevronRight, Search, ArrowRight } from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import Link from "next/link";

interface MultisigEntry {
  address: string;
  name: string | null;
  threshold: number;
  memberCount: number;
  vault: string;
  network: "mainnet" | "devnet" | null;
}

const isLikelyAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

const NETWORK_LABEL: Record<string, string> = { mainnet: "live", devnet: "test" };

export default function WalletMultisigPage() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const router = useRouter();
  const [multisigs, setMultisigs] = useState<MultisigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!publicKey) return;
    setLoading(true);

    (async () => {
      try {
        const [dbResp, indexedResp] = await Promise.all([
          fetch(`/api/multisig?wallet=${publicKey}`).then((r) => r.json()).catch(() => ({ multisigs: [] })),
          fetch(`/api/multisig/onchain?wallet=${publicKey}`).then((r) => r.json()).catch(() => ({ multisigs: [] })),
        ]);
        const fromDb: MultisigEntry[] = (dbResp.multisigs || []).map((m: { multisig_pda: string; name: string; threshold: number; member_count: number; vault: string; network: string | null }) => ({
          address: m.multisig_pda,
          name: m.name,
          threshold: m.threshold,
          memberCount: m.member_count,
          vault: m.vault,
          network: (m.network as "mainnet" | "devnet" | null) ?? null,
        }));
        const fromIndex: MultisigEntry[] = (indexedResp.multisigs || []).map((m: { address: string; name: string | null; threshold: number; memberCount: number; vault: string }) => ({
          address: m.address,
          name: m.name,
          threshold: m.threshold,
          memberCount: m.memberCount,
          vault: m.vault,
          network: null,
        }));
        const seen = new Set<string>();
        const merged: MultisigEntry[] = [];
        for (const m of [...fromDb, ...fromIndex]) {
          if (seen.has(m.address)) continue;
          seen.add(m.address);
          merged.push(m);
        }
        setMultisigs(merged);

        // Verify each address against actual on-chain presence so labels
        // reflect reality (DB values can be wrong for older rows).
        if (merged.length === 0) return;
        const verifyRes = await fetch("/api/multisig/verify-network", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: merged.map((m) => m.address) }),
        });
        if (!verifyRes.ok) return;
        const { results } = await verifyRes.json();
        setMultisigs((prev) =>
          prev.map((m) => {
            const verified = results?.[m.address];
            return verified ? { ...m, network: verified } : m;
          })
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [publicKey, network]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const v = search.trim();
    if (isLikelyAddress(v)) router.push(`/multisig/${v}`);
  };

  return (
    <WalletShell>
      <PageTransition>
        <form onSubmit={submitSearch} className="mb-3 flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="View any multisig by address…"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono placeholder:font-sans placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400/40 transition"
            />
          </div>
          <button
            type="submit"
            disabled={!isLikelyAddress(search.trim())}
            className="px-4 py-2.5 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white text-sm font-semibold transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
          >
            View <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {loading ? (
          <div className="text-center py-12">
            <Spinner size={24} className="text-fuchsia-400 mx-auto" />
          </div>
        ) : multisigs.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-gray-400 dark:text-white/30">No multisigs yet</p>
            <p className="text-xs text-gray-400 dark:text-white/30 max-w-xs mx-auto">
              Have one already? Paste the address above to view it.
            </p>
            <Link
              href="/multisig"
              className="text-fuchsia-400 hover:text-fuchsia-300 text-sm transition inline-block"
            >
              Or create a new one
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 dark:text-white/30">
              {multisigs.length} multisig{multisigs.length !== 1 ? "s" : ""}
            </p>
            {multisigs.map((ms) => (
              <Link
                key={ms.address}
                href={`/multisig/${ms.address}`}
                className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 hover:border-fuchsia-400/30 transition cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-fuchsia-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} className="text-fuchsia-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{ms.name || "Squad"}</p>
                    <span className="text-xs text-gray-400 dark:text-white/30 shrink-0">
                      {ms.threshold}/{ms.memberCount}
                    </span>
                    {ms.network && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 ${
                          ms.network === "mainnet"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-yellow-500/10 text-yellow-500"
                        }`}
                      >
                        {NETWORK_LABEL[ms.network] ?? ms.network}
                      </span>
                    )}
                  </div>
                  <p className="text-fuchsia-400/50 text-[10px] font-mono truncate">{ms.address}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/20 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </PageTransition>
    </WalletShell>
  );
}
