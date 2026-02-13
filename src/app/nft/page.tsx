"use client";

import { useState, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";

export default function NftPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ imageUrl?: string; metadataUri?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleMint = async () => {
    if (!name || !imageFile) return;
    setStatus("uploading");
    setError(null);
    try {
      const imageUrl = await uploadImage(imageFile);
      const metadata = await uploadMetadata({
        name,
        symbol: "NFT",
        description: description || `${name} — minted on sol.new`,
        image: imageUrl,
      });
      setResult({ imageUrl, metadataUri: metadata.uri });
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
                  <div className="text-green-400 text-sm font-medium">✓ Metadata uploaded to Irys</div>
                  {result.imageUrl && (
                    <div>
                      <p className="text-xs text-white/40">Image (IPFS)</p>
                      <a href={result.imageUrl} target="_blank" className="text-purple-400 text-sm break-all hover:text-purple-300">{result.imageUrl}</a>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-white/40">Metadata URI</p>
                    <a href={result.metadataUri} target="_blank" className="text-purple-400 text-sm break-all hover:text-purple-300">{result.metadataUri}</a>
                  </div>
                </div>
                <p className="text-center text-white/30 text-sm">On-chain NFT minting coming soon ✨</p>
                <button onClick={() => { setStatus("idle"); setResult(null); setName(""); setImageFile(null); setImagePreview(null); }} className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer">
                  Mint another →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input type="text" placeholder="NFT name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition" />
                <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition resize-none" />
                <label
                  onClick={() => fileRef.current?.click()}
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
                      <span className="text-white/30 text-sm">Drop an image or click to upload</span>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                <button onClick={handleMint} disabled={!name || !imageFile || status === "uploading"} className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed">
                  {status === "uploading" ? "Uploading..." : "Mint NFT →"}
                </button>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
