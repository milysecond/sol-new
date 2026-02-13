"use client";

import { fastIpfsUrl } from "@/lib/ipfs";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

interface Token {
  id: number;
  name: string;
  symbol: string;
  image_url: string | null;
  metadata_uri: string | null;
  mint_address: string | null;
  created_at: string;
}

interface Nft {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  metadata_uri: string | null;
  mint_address: string | null;
  created_at: string;
}

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [tab, setTab] = useState<"nfts" | "tokens">("nfts");
  const [loading, setLoading] = useState(true);

  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  useEffect(() => {
    if (!publicKey) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/token?wallet=${publicKey}`).then((r) => r.json()),
      fetch(`/api/nft?wallet=${publicKey}`).then((r) => r.json()),
    ])
      .then(([tokenData, nftData]) => {
        setTokens(tokenData.tokens || []);
        setNfts(nftData.nfts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        <ConnectGate action="view your portfolio">
          <div className="max-w-2xl w-full space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
              <p className="text-white/40 text-sm font-mono">
                {publicKey?.slice(0, 8)}...{publicKey?.slice(-8)}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setTab("nfts")}
                className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                  tab === "nfts"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-400/50"
                    : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                }`}
              >
                🖼️ NFTs {nfts.length > 0 && `(${nfts.length})`}
              </button>
              <button
                onClick={() => setTab("tokens")}
                className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                  tab === "tokens"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-400/50"
                    : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                }`}
              >
                🪙 Tokens {tokens.length > 0 && `(${tokens.length})`}
              </button>
            </div>

            {loading ? (
              <div className="text-center text-white/30 py-12">Loading...</div>
            ) : tab === "nfts" ? (
              nfts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-white/30">No NFTs yet</p>
                  <a href="/nft" className="text-purple-400 hover:text-purple-300 text-sm transition">
                    Mint your first NFT →
                  </a>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {nfts.map((nft) => (
                    <div
                      key={nft.id}
                      className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden hover:border-purple-400/30 transition"
                    >
                      {nft.image_url && (
                        <img
                          src={fastIpfsUrl(nft.image_url) || ""}
                          alt={nft.name}
                          className="w-full aspect-square object-cover"
                        />
                      )}
                      <div className="p-4 space-y-2">
                        <p className="font-semibold">{nft.name}</p>
                        {nft.description && (
                          <p className="text-white/40 text-sm line-clamp-2">{nft.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/20">
                            {new Date(nft.created_at + "Z").toLocaleDateString()}
                          </span>
                          {nft.mint_address && (
                            <a
                              href={`https://solscan.io/token/${nft.mint_address}${clusterParam}`}
                              target="_blank"
                              className="text-xs text-purple-400 hover:text-purple-300"
                            >
                              View ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tokens.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-white/30">No tokens yet</p>
                <a href="/token" className="text-purple-400 hover:text-purple-300 text-sm transition">
                  Launch your first token →
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 hover:border-purple-400/30 transition"
                  >
                    {token.image_url ? (
                      <img src={fastIpfsUrl(token.image_url) || ""} alt={token.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg">
                        🪙
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{token.name}</p>
                      <p className="text-white/40 text-xs font-mono">${token.symbol}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-white/20">
                        {new Date(token.created_at + "Z").toLocaleDateString()}
                      </span>
                      {token.mint_address && (
                        <a
                          href={`https://solscan.io/token/${token.mint_address}${clusterParam}`}
                          target="_blank"
                          className="block text-xs text-purple-400 hover:text-purple-300"
                        >
                          View ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
