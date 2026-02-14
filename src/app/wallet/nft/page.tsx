"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { fastIpfsUrl } from "@/lib/ipfs";
import { timeAgo } from "@/lib/time";

interface Nft {
  id: number; name: string; description: string | null; image_url: string | null;
  mint_address: string | null; created_at: string;
}

export default function WalletNftPage() {
  const { publicKey } = useWallet();
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedNft, setCopiedNft] = useState<string | null>(null);

  const copyNftAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedNft(address);
    setTimeout(() => setCopiedNft(null), 2000);
  };

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/nft?wallet=${publicKey}`).then(r => r.json())
      .then(d => setNfts(d.nfts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);


  return (
    <WalletShell>
      <PageTransition>
      {loading ? (
        <div className="text-center py-12"><Spinner size={24} className="text-fuchsia-400 mx-auto" /></div>
      ) : nfts.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-400 dark:text-white/30">No NFTs yet</p>
          <a href="/nft" className="text-fuchsia-400 hover:text-fuchsia-300 text-sm transition">Mint your first NFT</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {nfts.map((nft) => (
            <div key={nft.id} className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl overflow-hidden hover:border-fuchsia-400/30 transition">
              {nft.image_url && <img src={fastIpfsUrl(nft.image_url) || ""} alt={nft.name} className="w-full aspect-square object-cover" />}
              <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="font-semibold text-sm truncate">{nft.name}</p>
                  <span className="text-[10px] text-gray-400 dark:text-white/25 shrink-0">{timeAgo(nft.created_at)}</span>
                </div>
                {nft.mint_address && (
                  <div className="flex items-center gap-1">
                    <p className="text-fuchsia-400/70 text-[10px] font-mono truncate flex-1">{nft.mint_address}</p>
                    <button onClick={() => copyNftAddress(nft.mint_address!)} className="p-1 shrink-0">
                      {copiedNft === nft.mint_address ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400 dark:text-white/30" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </PageTransition>
    </WalletShell>
  );
}
