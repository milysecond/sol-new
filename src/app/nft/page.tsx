"use client";

import { fastIpfsUrl } from "@/lib/ipfs";
import { useState, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { signAndSendTransaction } from "@/lib/passkey-wallet";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Image, Zap, Coins, Paperclip } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";

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
  const { publicKey, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();

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
    let displayUrl: string;
    let metadataUri: string;
    try {
      const uploaded = await uploadImage(imageFile);
      imageUrl = uploaded.ipfs;
      displayUrl = uploaded.preview;
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

      let signature = data.signature;
      let mintAddress = data.mint || data.assetId;

      // For regular NFTs, user needs to sign the transaction
      if (data.type === "regular" && data.transaction) {
        signature = await signAndSendTransaction(data.transaction, rpc);
      }

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
          mintAddress,
        }),
      }).catch(() => {});

      setResult({ imageUrl: displayUrl, metadataUri, mint: mintAddress, signature, type: data.type });
      setStatus("done");
      // Refresh balance immediately after mint confirmation
      refreshBalance();
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
              <AnimatedIcon icon={Image} size={40} className="text-purple-400" />
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
                    <img src={fastIpfsUrl(result.imageUrl || null) || ""} alt={name} className="w-full rounded-xl" />
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

                {/* View NFT button */}
                {(result.mint || result.assetId) && (
                  <a
                    href={result.mint
                      ? `${explorerBase}/token/${result.mint}${clusterParam}`
                      : `https://xray.helius.xyz/token/${result.assetId}${clusterParam}`}
                    target="_blank"
                    className="block w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3.5 transition text-center"
                  >
                    View your NFT ↗
                  </a>
                )}

                {/* Copy link */}
                <button
                  onClick={() => {
                    const url = result.mint
                      ? `${explorerBase}/token/${result.mint}${clusterParam}`
                      : `https://xray.helius.xyz/token/${result.assetId}${clusterParam}`;
                    navigator.clipboard.writeText(url);
                  }}
                  className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer"
                >
                  Copy link to share
                </button>

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
                      <img src={imagePreview || ""} alt="preview" className="w-24 h-24 rounded-xl object-cover" />
                      <span className="text-white/50 text-sm">{imageFile?.name}</span>
                    </div>
                  ) : (
                    <>
                      <Paperclip size={24} className="mb-2 text-white/40" />
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
                      {t === "compressed" ? <><Zap size={14} className="inline mr-1" /> Compressed</> : <><Coins size={14} className="inline mr-1" /> Regular</>}
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
