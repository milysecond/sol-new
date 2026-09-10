"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers } from "lucide-react";
import { Connection } from "@solana/web3.js";
import { AnimatedIcon } from "@/components/animated-icon";
import { PageTransition } from "@/components/page-transition";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useImagePaste } from "@/lib/use-image-paste";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { analytics } from "@/lib/analytics";
import { friendlyError } from "@/lib/friendly-errors";
import { TokenSocials, useTokenSocials } from "@/components/token-socials";

const ac = {
  text: "text-indigo-400",
  btn: "bg-indigo-500 hover:bg-indigo-400",
};

export default function LaunchLabForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const socials = useTokenSocials();
  const [status, setStatus] = useState<
    "idle" | "auth" | "uploading" | "creating" | "confirming" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { publicKey, refreshBalance } = useWallet();
  const { rpc } = useNetwork();

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  useImagePaste(acceptImage);

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile || !publicKey) return;
    setError(null);
    analytics.launchInitiated(ticker, "launchlab");
    try {
      setStatus("auth");
      const { keypair: userKeypair } = await getPasskeyKeypair();
      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const metadata = await uploadMetadata({
        name,
        symbol: ticker,
        description,
        image: uploaded.url,
        ...socials.filled,
      });
      setStatus("creating");
      const { createLaunchLabTx } = await import("@/lib/launchlab");
      const connection = new Connection(rpc, "confirmed");
      const { mint } = await createLaunchLabTx({
        connection,
        owner: userKeypair,
        name,
        symbol: ticker,
        uri: metadata.uri,
      });
      setStatus("confirming");
      await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          name,
          symbol: ticker,
          description,
          imageUrl: uploaded.url,
          metadataUri: metadata.uri,
          mintAddress: mint,
          network: "mainnet",
        }),
      }).catch(() => {});
      await refreshBalance();
      analytics.tokenCreated(mint, ticker);
      router.push(`/launch/${mint}`);
    } catch (e: unknown) {
      analytics.launchFailed(ticker, String(e).slice(0, 120));
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
      setStatus("error");
    }
  };

  const busy = status !== "idle" && status !== "error";
  return (
    <PageTransition>
      <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-4">
        <div className="text-center space-y-1 relative">
          <button
            onClick={onBack}
            className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={15} />
          </button>
          <AnimatedIcon icon={Layers} size={32} className={ac.text} />
          <h1 className="text-2xl font-bold tracking-tight">Raydium LaunchLab</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">
            JustSendit-style create · graduates to Raydium CPMM
          </p>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none disabled:opacity-50"
          />
          <input
            type="text"
            placeholder="Ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={10}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none font-mono disabled:opacity-50"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none resize-none disabled:opacity-50"
          />
          <label
            htmlFor="ll-image"
            className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer overflow-hidden"
          >
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
              </div>
            ) : (
              <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload or paste an image</span>
            )}
          </label>
          <input
            id="ll-image"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptImage(f);
            }}
            className="sr-only"
          />
          <TokenSocials socials={socials} accent="indigo" disabled={busy} />
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          {busy ? (
            <p className="text-center text-sm text-gray-500 dark:text-white/50">
              {status === "auth" && "Signing in…"}
              {status === "uploading" && "Uploading image…"}
              {status === "creating" && "Building LaunchLab tx…"}
              {status === "confirming" && "Confirming…"}
            </p>
          ) : (
            <>
              <button
                onClick={handleLaunch}
                disabled={!name || !ticker || !imageFile || !publicKey}
                className={`w-full ${ac.btn} disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed`}
              >
                Launch on LaunchLab
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-white/30">
                Raydium SDK · SOL curve · CPMM at graduation
              </p>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
