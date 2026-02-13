"use client";
import { Coins, ExternalLink, Copy, Check, Rocket } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";

import { useState, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

export default function TokenPage() {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "creating" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    imageUrl?: string;
    metadataUri?: string;
    pool?: string;
    mint?: string;
    meteoraUrl?: string;
    solscanUrl?: string;
    transactions?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleLaunch = async () => {
    if (!name || !ticker) return;
    setStatus("uploading");
    setError(null);
    try {
      // Step 1: Upload image + metadata
      let imageUrl: string | undefined;
      let displayUrl: string | undefined;
      if (imageFile) {
        const uploaded = await uploadImage(imageFile);
        imageUrl = uploaded.ipfs;
        displayUrl = uploaded.preview;
      }
      const metadata = await uploadMetadata({
        name,
        symbol: ticker,
        description: description || `${name} ($${ticker}) — created on sol.new`,
        image: imageUrl,
      });

      // Step 2: Create DBC pool on-chain
      setStatus("creating");
      const dbcRes = await fetch("/api/create-dbc-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol: ticker,
          description: description || `${name} ($${ticker})`,
          metadataUri: metadata.uri,
          creatorWallet: publicKey,
          network,
        }),
      });
      const dbcData = await dbcRes.json();
      if (!dbcRes.ok) throw new Error(dbcData.error || "Pool creation failed");

      setResult({
        imageUrl: displayUrl || imageUrl,
        metadataUri: metadata.uri,
        pool: dbcData.pool,
        mint: dbcData.mint,
        meteoraUrl: dbcData.meteoraUrl,
        solscanUrl: dbcData.solscanUrl,
        transactions: dbcData.transactions,
      });

      // Save to DB
      fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          name,
          symbol: ticker,
          supply,
          description,
          imageUrl,
          metadataUri: metadata.uri,
          mintAddress: dbcData.mint,
        }),
      }).catch(() => {});

      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ConnectGate action="launch a token">
          <div className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Coins} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Launch a token</h1>
              <p className="text-white/50">Create a Solana token with a Meteora bonding curve.</p>
            </div>

            {status === "done" && result ? (
              <div className="space-y-4">
                <div className="bg-white/5 border border-green-500/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <Rocket className="w-4 h-4" />
                    Token launched on Meteora DBC
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-white/40">Token</p>
                      <p className="text-white font-semibold">{name} (${ticker})</p>
                    </div>
                    {result.mint && result.mint !== "unknown" && (
                      <div>
                        <p className="text-xs text-white/40">Mint Address</p>
                        <div className="flex items-center gap-2">
                          <span className="text-purple-400 text-sm font-mono break-all">{result.mint}</span>
                          <button onClick={() => copyText(result.mint!, "mint")} className="text-white/30 hover:text-white transition">
                            {copied === "mint" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {result.pool && result.pool !== "unknown" && (
                      <div>
                        <p className="text-xs text-white/40">Pool Address</p>
                        <div className="flex items-center gap-2">
                          <span className="text-purple-400 text-sm font-mono break-all">{result.pool}</span>
                          <button onClick={() => copyText(result.pool!, "pool")} className="text-white/30 hover:text-white transition">
                            {copied === "pool" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {result.metadataUri && (
                      <div>
                        <p className="text-xs text-white/40">Metadata</p>
                        <a href={result.metadataUri} target="_blank" className="text-purple-400 text-sm break-all hover:text-purple-300">{result.metadataUri}</a>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    {result.meteoraUrl && (
                      <a href={result.meteoraUrl} target="_blank" className="flex-1 flex items-center justify-center gap-1.5 bg-purple-500/20 text-purple-400 rounded-lg px-3 py-2 text-sm hover:bg-purple-500/30 transition">
                        <ExternalLink className="w-3.5 h-3.5" /> Meteora
                      </a>
                    )}
                    {result.solscanUrl && (
                      <a href={result.solscanUrl} target="_blank" className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 text-white/60 rounded-lg px-3 py-2 text-sm hover:bg-white/10 transition">
                        <ExternalLink className="w-3.5 h-3.5" /> Solscan
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={() => { setStatus("idle"); setResult(null); setName(""); setTicker(""); setDescription(""); setImageFile(null); setImagePreview(null); }} className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer">
                  Create another →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition" />
                <input type="text" placeholder="Ticker (e.g. SOL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={10} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono" />
                <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition resize-none" />
                
                <label
                  htmlFor="token-image-upload"
                  className="flex items-center justify-center w-full bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-6 cursor-pointer hover:border-white/20 transition overflow-hidden"
                >
                  {imagePreview ? (
                    <div className="flex items-center gap-3">
                      <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="text-white/50 text-sm">{imageFile?.name}</span>
                    </div>
                  ) : (
                    <span className="text-white/30 text-sm">Tap to upload image (optional)</span>
                  )}
                </label>
                <input id="token-image-upload" ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="sr-only" />

                {/* Bonding curve info */}
                <div className="bg-white/5 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-white/40 font-medium">Meteora Dynamic Bonding Curve</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/50">
                    <span>Supply: 1B tokens</span>
                    <span>Fee: 1% (flat)</span>
                    <span>Graduation: ~85 SOL</span>
                    <span>Migration: DAMM v2</span>
                    <span>Authority: Immutable</span>
                    <span>LP: 80% creator</span>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                <button
                  onClick={handleLaunch}
                  disabled={!name || !ticker || status === "uploading" || status === "creating"}
                  className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {status === "uploading" ? "Uploading metadata..." : status === "creating" ? "Creating pool on-chain..." : "Launch token →"}
                </button>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
