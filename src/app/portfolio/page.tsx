"use client";

import { fastIpfsUrl } from "@/lib/ipfs";

import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon, Coins, ExternalLink, Search, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { resolveRecipient } from "@/lib/resolve-name";

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
  const [input, setInput] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [tab, setTab] = useState<"nfts" | "tokens">("nfts");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  const loadFor = useCallback(async (wallet: string) => {
    setLoading(true);
    setError(null);
    try {
      const [tokenData, nftData] = await Promise.all([
        fetch(`/api/token?wallet=${wallet}`).then(
          (r) => r.json() as Promise<{ tokens?: Token[] }>,
        ),
        fetch(`/api/nft?wallet=${wallet}`).then(
          (r) => r.json() as Promise<{ nfts?: Nft[] }>,
        ),
      ]);
      setTokens(tokenData.tokens || []);
      setNfts(nftData.nfts || []);
    } catch {
      setError("Could not load portfolio.");
      setTokens([]);
      setNfts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Default to connected wallet
  useEffect(() => {
    if (!publicKey) return;
    if (!owner) {
      setOwner(publicKey);
      setInput(publicKey);
      setOwnerLabel(null);
    }
  }, [publicKey, owner]);

  useEffect(() => {
    if (!owner) return;
    void loadFor(owner);
  }, [owner, loadFor]);

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
      setOwner(result.owner);
      setOwnerLabel(
        result.kind !== "pubkey" ? result.domain || raw.toLowerCase() : null,
      );
      setInput(result.kind !== "pubkey" ? raw : result.owner);
    } finally {
      setResolving(false);
    }
  };

  const clearLookup = () => {
    setInput(publicKey || "");
    setOwner(publicKey || null);
    setOwnerLabel(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <PageTransition>
          <div className="w-full sm:max-w-2xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
              <p className="text-gray-500 dark:text-white/40 text-sm">
                Look up any wallet, or use your passkey wallet.
              </p>
            </div>

            <div className="space-y-2">
              <div className="relative flex gap-2">
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
                    placeholder="Address or name.sol / .bonk / .skr"
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={clearLookup}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white cursor-pointer"
                      aria-label="Clear"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void lookup()}
                  disabled={resolving || !input.trim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium cursor-pointer"
                >
                  {resolving ? <Spinner size={14} /> : "Look up"}
                </button>
              </div>
              {owner && (
                <p className="text-xs text-gray-500 dark:text-white/40 font-mono truncate">
                  {ownerLabel ? (
                    <>
                      <span className="text-purple-700 dark:text-purple-400">
                        {ownerLabel}
                      </span>{" "}
                      → {owner.slice(0, 6)}…{owner.slice(-6)}
                    </>
                  ) : (
                    <>
                      {owner.slice(0, 8)}…{owner.slice(-8)}
                    </>
                  )}
                </p>
              )}
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>

            {!owner && !publicKey && (
              <p className="text-center text-sm text-gray-400">
                Enter a wallet address or name, or connect a passkey wallet.
              </p>
            )}

            {owner && (
              <>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => setTab("nfts")}
                    className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                      tab === "nfts"
                        ? "bg-purple-500/15 text-purple-800 dark:text-purple-200 border border-purple-400/50"
                        : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/50 border border-black/10 dark:border-white/10"
                    }`}
                  >
                    <ImageIcon size={14} className="inline mr-1" /> NFTs{" "}
                    {nfts.length > 0 && `(${nfts.length})`}
                  </button>
                  <button
                    onClick={() => setTab("tokens")}
                    className={`px-4 py-2 rounded-xl text-sm transition cursor-pointer ${
                      tab === "tokens"
                        ? "bg-purple-500/15 text-purple-800 dark:text-purple-200 border border-purple-400/50"
                        : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/50 border border-black/10 dark:border-white/10"
                    }`}
                  >
                    <Coins size={14} className="inline mr-1" /> Tokens{" "}
                    {tokens.length > 0 && `(${tokens.length})`}
                  </button>
                </div>

                {loading ? (
                  <div className="text-center text-gray-400 dark:text-white/30 py-12 flex justify-center gap-2">
                    <Spinner size={16} /> Loading…
                  </div>
                ) : tab === "nfts" ? (
                  nfts.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <p className="text-gray-400 dark:text-white/30">No NFTs found</p>
                      <a
                        href="/nft"
                        className="text-purple-600 dark:text-purple-400 hover:underline text-sm"
                      >
                        Mint an NFT
                      </a>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {nfts.map((nft) => (
                        <div
                          key={nft.id}
                          className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden"
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
                              <p className="text-gray-500 dark:text-white/40 text-sm line-clamp-2">
                                {nft.description}
                              </p>
                            )}
                            {nft.mint_address && (
                              <a
                                href={`https://solscan.io/token/${nft.mint_address}${clusterParam}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-0.5 text-xs text-purple-600 dark:text-purple-400"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : tokens.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <p className="text-gray-400 dark:text-white/30">No tokens found</p>
                    <a
                      href="/token"
                      className="text-purple-600 dark:text-purple-400 hover:underline text-sm"
                    >
                      Launch a token
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
                      >
                        {token.image_url ? (
                          <img
                            src={fastIpfsUrl(token.image_url) || ""}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Coins size={16} className="text-purple-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{token.name}</p>
                          <p className="text-xs text-gray-400 font-mono">${token.symbol}</p>
                        </div>
                        {token.mint_address && (
                          <a
                            href={`/token/${token.mint_address}`}
                            className="text-xs text-purple-600 dark:text-purple-400"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
