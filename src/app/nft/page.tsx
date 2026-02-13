"use client";

import { useState, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

type MintType = "compressed" | "regular";

export default function NftPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mintType, setMintType] = useState<MintType>("compressed");
  const [status, setStatus] = useState<"idle" | "uploading" | "minting" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    imageUrl?: string;
    metadataUri?: string;
    mint?: string;
    assetId?: string;
    signature?: string;
    type?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { publicKey } = useWallet();
  const { network } = useNetwork();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleMint = async () => {
    if (!name || !imageFile || !publicKey) return;
    setError(null);

    // Step 1: Upload image
    setStatus("uploading");
    let imageUrl: string;
    let metadataUri: string;
    try {
      imageUrl = await uploadImage(imageFile);
      const metadata = await uploadMetadata({
        name,
        symbol: "NFT",
        description: description || `${name} — minted on sol.new`,
        image: imageUrl,
      });
      metadataUri = metadata.uri;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
      return;
    }

    // Step 2: Mint on-chain
    setStatus("minting");
    try {
      const res = await fetch("/api/mint-nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: publicKey,
          name,
          symbol: "NFT",
          uri: metadataUri,
          description: description || `${name} — minted on sol.new`,
          network,
          compressed: mintType === "compressed",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mint failed");

      // Save to DB
      fetch("/api/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          name,
          description,
          imageUrl,
          metadataUri,
          mintAddress: data.mint || data.assetId,
        }),
      }).catch(() => {});

      setResult({ imageUrl, metadataUri, ...data });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed");
      setStatus("error");
    }
  };

  const explorerBase = network === "devnet" ? "https://solscan.io" : "https://solscan.io";
  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <ConnectGate action="mint an NFT">
          <div className="max-w-lg w-full space-y-8">
            <div className="text-center space-y-3">
              <div className="text-4xl">🖼️</div>
              <h1 className="text-3xl font-bold tracking-tight">Mint an NFT</h1>
              <p className="text-white/50">Turn any image into a Solana NFT.</p>
            </div>

            {status === "done" && result ? (
              <div className="space-y-4">
                <div className="bg-white/5 border border-green-500/30 rounded-xl p-6 space-y-3">
                  <div className="text-green-400 text-sm font-medium">
                    ✓ {result.type === "compressed" ? "Compressed" : "Regular"} NFT minted!
                  </div>
                  {result.imageUrl && (
                    <img src={result.imageUrl} alt={name} className="w-full rounded-xl" />
                  )}
                  <div>
                    <p className="text-white font-semibold">{name}</p>
                    {description && <p className="text-white/40 text-sm">{description}</p>}
                  </div>
                  {result.mint && (
                    <div>
                      <p className="text-xs text-white/40">Mint address</p>
                      <a
                        href={`${explorerBase}/token/${result.mint}${clusterParam}`}
                        target="_blank"
                        className="text-purple-400 text-sm break-all hover:text-purple-300"
                      >
                        {result.mint}
                      </a>
                    </div>
                  )}
                  {result.assetId && (
                    <div>
                      <p className="text-xs text-white/40">Asset ID</p>
                      <p className="text-purple-400 text-sm break-all">{result.assetId}</p>
                    </div>
                  )}
                  {result.signature && (
                    <div>
                      <p className="text-xs text-white/40">Transaction</p>
                      <a
                        href={`${explorerBase}/tx/${result.signature}${clusterParam}`}
                        target="_blank"
                        className="text-purple-400 text-sm break-all hover:text-purple-300"
                      >
                        {result.signature}
                      </a>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setStatus("idle");
                    setResult(null);
                    setName("");
                    setDescription("");
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer"
                >
                  Mint another →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="NFT name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition resize-none"
                />
                <label
                  htmlFor="nft-image-upload"
                  className="flex flex-col items-center justify-center w-full bg-white/5 border border-dashed border-white/10 rounded-xl px-4 py-10 cursor-pointer hover:border-white/20 transition"
                >
                  {imagePreview ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={imagePreview} alt="preview" className="w-24 h-24 rounded-xl object-cover" />
                      <span className="text-white/50 text-sm">{imageFile?.name}</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-2xl mb-2">📎</span>
                      <span className="text-white/30 text-sm">Tap to upload an image</span>
                    </>
                  )}
                </label>
                <input id="nft-image-upload" ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="sr-only" />

                {/* Mint type toggle */}
                <div className="flex gap-2">
                  {(["compressed", "regular"] as MintType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMintType(t)}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                        mintType === t
                          ? "bg-purple-500/20 border-purple-400/50 text-purple-300"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {t === "compressed" ? "⚡ Compressed" : "🪙 Regular"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/30 text-center">
                  {mintType === "compressed"
                    ? "Compressed NFTs cost ~0.00005 SOL — ideal for large collections"
                    : "Regular NFTs are standard SPL tokens with full on-chain metadata"}
                </p>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleMint}
                  disabled={!name || !imageFile || status === "uploading" || status === "minting"}
                  className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {status === "uploading"
                    ? "Uploading to IPFS..."
                    : status === "minting"
                    ? "Minting on Solana..."
                    : `Mint ${mintType === "compressed" ? "compressed" : "regular"} NFT →`}
                </button>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
