"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useImagePaste } from "@/lib/use-image-paste";
import { Connection, Transaction } from "@solana/web3.js";
import { Rocket, Plus, X, TrendingUp, Clock, Zap, ExternalLink, Image as ImageIcon } from "lucide-react";

type PumpCoin = {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  usd_market_cap?: number;
  market_cap?: number;
  king_of_the_hill_progress?: number;
  complete?: boolean;
  created_timestamp?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
};

function formatMcap(usd: number | undefined): string {
  if (!usd) return "—";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function TokenCard({ coin }: { coin: PumpCoin }) {
  const progress = coin.king_of_the_hill_progress
    ? Math.min(100, Math.round(coin.king_of_the_hill_progress * 100))
    : 0;
  return (
    <Link
      href={`/launch/${coin.mint}`}
      className="group flex gap-3 p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/2 dark:bg-white/2 hover:border-purple-400/30 hover:bg-purple-500/5 transition"
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-black/10 dark:bg-white/10">
        {coin.image_uri ? (
          <img src={coin.image_uri} alt={coin.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-white/20">
            <ImageIcon size={20} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-sm truncate text-gray-900 dark:text-white">{coin.name}</span>
          <span className="text-xs text-gray-500 dark:text-white/40 font-mono shrink-0">${coin.symbol}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-white/40 truncate mt-0.5">{coin.description || ""}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-green-500 dark:text-green-400 font-mono">{formatMcap(coin.usd_market_cap)}</span>
          {coin.complete ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 dark:text-green-400 border border-green-500/20">Graduated</span>
          ) : (
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden max-w-[60px]">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 dark:text-white/30">{progress}%</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "auth" | "uploading" | "creating" | "confirming" | "done" | "error">("idle");
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
    try {
      setStatus("auth");
      const { keypair: userKeypair } = await getPasskeyKeypair();

      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const imageUrl = uploaded.url;
      const socials: Record<string, string> = {};
      if (twitter) socials.twitter = twitter;
      if (telegram) socials.telegram = telegram;
      if (website) socials.website = website;
      const metadata = await uploadMetadata({ name, symbol: ticker, description, image: imageUrl, ...socials });

      setStatus("creating");
      const res = await fetch("/api/launch/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol: ticker, metadataUri: metadata.uri, creatorWallet: publicKey }),
      });
      const data = await res.json() as { ok?: boolean; tx?: string; mint?: string; blockhash?: string; lastValidBlockHeight?: number; error?: string };
      if (!data.ok || !data.tx || !data.mint) throw new Error(data.error ?? "Failed to build transaction");

      const txBytes = Buffer.from(data.tx, "base64");
      const tx = Transaction.from(txBytes);
      tx.partialSign(userKeypair);

      const connection = new Connection(rpc, "confirmed");
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });

      setStatus("confirming");
      await connection.confirmTransaction(
        { signature: sig, blockhash: data.blockhash!, lastValidBlockHeight: data.lastValidBlockHeight! },
        "confirmed",
      );

      // Save to our DB
      await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, name, symbol: ticker, description, imageUrl, metadataUri: metadata.uri, mintAddress: data.mint, network: "mainnet" }),
      }).catch(() => {});

      await refreshBalance();
      router.push(`/launch/${data.mint}`);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status !== "idle" && status !== "error";
  const STATUS_LABELS: Record<string, string> = { auth: "Authenticating…", uploading: "Uploading…", creating: "Building tx…", confirming: "Confirming…", done: "Done!" };
  const statusLabel = STATUS_LABELS[status] ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="font-semibold text-gray-900 dark:text-white">Launch a token</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <input
            type="text"
            placeholder="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition disabled:opacity-50"
          />
          <input
            type="text"
            placeholder="Ticker (e.g. PEPE)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={8}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition font-mono disabled:opacity-50"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition resize-none disabled:opacity-50"
          />

          <label
            htmlFor="launch-image"
            className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden"
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
          <input id="launch-image" ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptImage(f); }} className="sr-only" />

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "twitter", placeholder: "X / Twitter" },
              { key: "telegram", placeholder: "Telegram" },
              { key: "website", placeholder: "Website" },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                type="text"
                placeholder={placeholder}
                value={key === "twitter" ? twitter : key === "telegram" ? telegram : website}
                onChange={(e) => { const v = e.target.value; if (key === "twitter") setTwitter(v); else if (key === "telegram") setTelegram(v); else setWebsite(v); }}
                disabled={busy}
                className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-xs disabled:opacity-50"
              />
            ))}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="pt-1 space-y-2">
            <button
              onClick={handleLaunch}
              disabled={busy || !name || !ticker || !imageFile}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? <><Spinner size={16} /> {statusLabel}</> : <><Rocket size={16} /> Launch on pump.fun</>}
            </button>
            <p className="text-center text-xs text-gray-400 dark:text-white/30">~0.0075 SOL (rent only) · graduates to Raydium</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: "new", label: "New", icon: Clock },
  { key: "trending", label: "Trending", icon: TrendingUp },
  { key: "graduating", label: "Graduating", icon: Zap },
] as const;

type Tab = "new" | "trending" | "graduating";

export default function LaunchPage() {
  const [tab, setTab] = useState<Tab>("new");
  const [coins, setCoins] = useState<PumpCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchFeed = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/launch/feed?tab=${t}`);
      const d = await r.json() as { ok?: boolean; coins?: PumpCoin[] };
      setCoins(d.coins ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeed(tab); }, [tab, fetchFeed]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Launch</h1>
            <p className="text-sm text-gray-500 dark:text-white/40">pump.fun tokens — free to create</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-400 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition cursor-pointer"
          >
            <Plus size={16} /> Create
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-black/10 dark:border-white/10 pb-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition border-b-2 -mb-px cursor-pointer ${
                tab === key
                  ? "border-purple-400 text-purple-500 dark:text-purple-400"
                  : "border-transparent text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={24} className="text-purple-400" />
          </div>
        ) : coins.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-white/30 text-sm">No tokens found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {coins.map((coin) => (
              <TokenCard key={coin.mint} coin={coin} />
            ))}
          </div>
        )}

        <div className="mt-4 text-center">
          <a
            href="https://pump.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition"
          >
            Powered by pump.fun <ExternalLink size={11} />
          </a>
        </div>
      </main>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
