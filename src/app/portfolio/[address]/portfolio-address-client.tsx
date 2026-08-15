"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { PortfolioDefiPanel } from "@/components/portfolio-defi-panel";
import { looksLikeDomain, resolveRecipient } from "@/lib/resolve-name";
import { Spinner } from "@/components/spinner";

export function PortfolioAddressClient({ address }: { address: string }) {
  const router = useRouter();
  const [input, setInput] = useState(address);
  const [resolved, setResolved] = useState<string | null>(null);
  const [domainLabel, setDomainLabel] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-resolve SNS/ADNS/SKR path segments → owner pubkey
  useEffect(() => {
    let cancelled = false;
    const raw = address.trim();
    if (!raw) return;

    if (!looksLikeDomain(raw) && !raw.includes(".")) {
      setResolved(raw);
      setDomainLabel(null);
      return;
    }

    setResolving(true);
    setError(null);
    resolveRecipient(raw)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setResolved(null);
          return;
        }
        setDomainLabel(result.resolvedAs || result.domain || raw);
        setResolved(result.owner);
        setInput(result.resolvedAs || result.domain || result.owner);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const lookup = async () => {
    const raw = input.trim();
    if (!raw) return;
    setResolving(true);
    setError(null);
    try {
      const result = await resolveRecipient(raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const pathKey = result.domain || result.owner;
      router.push(`/portfolio/${encodeURIComponent(pathKey)}`);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-3 sm:px-6 py-4 sm:py-8 sm:items-center pb-24">
        <PageTransition>
          <div className="w-full sm:max-w-2xl space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Portfolio</h1>
              <p className="text-sm text-gray-500 dark:text-white/45">
                Token balances + Jupiter DeFi positions
              </p>
              {domainLabel && (
                <p className="text-xs font-mono text-purple-400">{domainLabel}</p>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookup();
                  }}
                  placeholder="wallet or name.sol / .bonk / .sns / .skr"
                  className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono"
                  spellCheck={false}
                />
              </div>
              <button
                type="button"
                onClick={() => void lookup()}
                disabled={resolving || !input.trim()}
                className="min-h-[44px] px-4 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-40"
              >
                {resolving ? <Spinner size={14} /> : "Go"}
              </button>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}

            {resolving && !resolved && (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            )}
            {resolved && <PortfolioDefiPanel address={resolved} />}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
