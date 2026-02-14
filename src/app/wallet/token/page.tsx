"use client";

import { useEffect, useState } from "react";
import { Coins, ArrowRight } from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { fastIpfsUrl } from "@/lib/ipfs";
import { timeAgo } from "@/lib/time";

interface Token {
  id: number; name: string; symbol: string; image_url: string | null;
  mint_address: string | null; created_at: string;
}

export default function WalletTokenPage() {
  const { publicKey } = useWallet();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/token?wallet=${publicKey}`).then(r => r.json())
      .then(d => setTokens(d.tokens || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);


  return (
    <WalletShell>
      <PageTransition>
      {loading ? (
        <div className="text-center py-12"><Spinner size={24} className="text-purple-400 mx-auto" /></div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-400 dark:text-white/30">No tokens yet</p>
          <a href="/token" className="text-purple-400 hover:text-purple-300 text-sm transition">Launch your first token</a>
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <a key={token.id} href={token.mint_address ? `/launch/${token.mint_address}` : undefined} className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 hover:border-purple-400/30 transition cursor-pointer">
              {token.image_url ? (
                <img src={fastIpfsUrl(token.image_url) || ""} alt={token.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0"><Coins size={16} className="text-purple-400" /></div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="font-semibold text-sm">{token.name}</p>
                  <p className="text-gray-400 dark:text-white/30 text-xs font-mono">${token.symbol}</p>
                  <span className="text-[10px] text-gray-400 dark:text-white/25 ml-auto shrink-0">{timeAgo(token.created_at)}</span>
                </div>
                {token.mint_address && (
                  <p className="text-purple-400/50 text-[10px] font-mono truncate">{token.mint_address}</p>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 dark:text-white/20 shrink-0" />
            </a>
          ))}
        </div>
      )}
      </PageTransition>
    </WalletShell>
  );
}
