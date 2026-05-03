"use client";
import { Coins, Rocket } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { PageTransition } from "@/components/page-transition";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { analytics } from "@/lib/analytics";

const WRAPPED_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const DBC_PARTNER_CONFIG = new PublicKey("ptrXeNGhf62Y8V3wF1Z8b1LDP9YGBw2QG3vJ5gsKdzV");

export default function TokenPage() {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [website, setWebsite] = useState("https://");
  const [twitter, setTwitter] = useState("https://x.com/");
  const [telegram, setTelegram] = useState("https://t.me/");
  const [instagram, setInstagram] = useState("https://instagram.com/");
  const [github, setGithub] = useState("https://github.com/");
  const [youtube, setYoutube] = useState("https://youtube.com/");
  const [tiktok, setTiktok] = useState("https://tiktok.com/@");
  const [activeSocials, setActiveSocials] = useState<Set<string>>(new Set());
  const [mutableMetadata, setMutableMetadata] = useState(true);
  const [status, setStatus] = useState<"idle" | "auth" | "uploading" | "creating" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { publicKey, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile) return;
    setError(null);
    try {
      // Step 1: Authenticate
      setStatus("auth");
      const { address, keypair: userKeypair } = await getPasskeyKeypair();
      
      // Check balance before proceeding
      const connection0 = new Connection(rpc, "confirmed");
      const balance = await connection0.getBalance(new PublicKey(address));
      const MIN_BALANCE = 0.03 * 1e9;
      if (balance < MIN_BALANCE) {
        throw new Error(`You need at least 0.03 SOL to launch a token. Your balance is ${(balance / 1e9).toFixed(4)} SOL. Add funds from the Get page.`);
      }

      // Step 2: Upload image + metadata
      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const imageUrl = uploaded.url;
      const displayUrl = uploaded.preview;
      const metadata = await uploadMetadata({
        name,
        symbol: ticker,
        description,
        image: imageUrl,
        ...(website && website !== "https://" && { website }),
        ...(twitter && twitter !== "https://x.com/" && { twitter }),
        ...(telegram && telegram !== "https://t.me/" && { telegram }),
        ...(instagram && instagram !== "https://instagram.com/" && { instagram }),
        ...(github && github !== "https://github.com/" && { github }),
        ...(youtube && youtube !== "https://youtube.com/" && { youtube }),
        ...(tiktok && tiktok !== "https://tiktok.com/@" && { tiktok }),
      });

      // Step 3: Create pool onchain (client-side)
      setStatus("creating");
      const connection = new Connection(rpc, "confirmed");
      const client = new DynamicBondingCurveClient(connection, "confirmed");
      
      // Try to get a pre-ground "NEW..." keypair, fall back to random
      let mintKeypair: Keypair;
      try {
        const gk = await fetch("/api/ground-key").then(r => r.json());
        if (gk.ok && gk.secretKey) {
          const bs58 = (await import("bs58")).default;
          mintKeypair = Keypair.fromSecretKey(bs58.decode(gk.secretKey));
        } else {
          mintKeypair = Keypair.generate();
        }
      } catch {
        mintKeypair = Keypair.generate();
      }
      const userPubkey = new PublicKey(address);
      
      // Build pool creation transaction
      const tx: Transaction = await client.pool.createPool({
        config: DBC_PARTNER_CONFIG,
        baseMint: mintKeypair.publicKey,
        name,
        symbol: ticker,
        uri: metadata.uri,
        payer: userPubkey,
        poolCreator: userPubkey,
      });

      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.feePayer = userPubkey;
      tx.recentBlockhash = blockhash;
      
      // Dynamic platform fee calculation
      // Total price: 0.03 SOL
      // Estimated rent/tx fees: ~0.025 SOL (varies with accounts created)
      // Platform fee: remaining amount
      const TOTAL_PRICE = 0.03 * LAMPORTS_PER_SOL;
      const FEE_VAULT = new PublicKey("nEWKinAMMZv3zyHKSaLLyWsw6JBdbpES8ktgRnf6Tzf");
      
      // Calculate fee for message
      const feeCalc = await connection.getFeeForMessage(tx.compileMessage());
      const txFee = feeCalc.value || 5000;
      
      // Mainnet DBC pool creation creates more accounts than devnet — actual rent ≈ 0.025 SOL
      const estimatedRent = 0.025 * LAMPORTS_PER_SOL;

      // Platform fee = Total - (tx fee + rent), clamped to wallet headroom so we never
      // push the on-chain cost above the user's balance.
      const headroom = balance - estimatedRent - txFee;
      let platformFee = TOTAL_PRICE - txFee - estimatedRent;
      if (platformFee > headroom) platformFee = headroom;
      if (platformFee < 0) platformFee = 0;
      
      // Add platform fee transfer (only if positive)
      if (platformFee > 0) {
        tx.add(SystemProgram.transfer({
          fromPubkey: userPubkey,
          toPubkey: FEE_VAULT,
          lamports: platformFee,
        }));
      }
      
      // Sign with both keypairs (user + mint)
      tx.partialSign(mintKeypair, userKeypair);

      // Send transaction
      const txId = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      
      setStatus("confirming");
      await connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      // Derive pool address
      const poolAddress = deriveDbcPoolAddress(WRAPPED_SOL, mintKeypair.publicKey, DBC_PARTNER_CONFIG);
      const mintAddress = mintKeypair.publicKey.toBase58();
      const poolAddr = poolAddress.toBase58();

      // Save to DB
      fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          name,
          symbol: ticker,
          supply,
          description,
          imageUrl,
          metadataUri: metadata.uri,
          mintAddress,
        }),
      }).catch(() => {});

      // Update balance and redirect
      refreshBalance();

      // Track token creation
      analytics.tokenCreated(mintAddress, ticker);
      analytics.launchInitiated(mintAddress, 'meteora-dbc');
      router.push(`/launch/${mintAddress}`);
      return;
    } catch (e: unknown) {
      let msg = "Something went wrong. Please try again.";
      if (e instanceof Error) {
        const m = e.message;
        if (m.includes("insufficient lamports") || m.includes("0x1")) {
          msg = "Not enough SOL in your wallet. Add funds from the Get page and try again.";
        } else if (m.includes("blockhash") || m.includes("expired")) {
          msg = "Transaction timed out. Please try again.";
        } else if (m.includes("User cancelled") || m.includes("NotAllowedError")) {
          msg = "Sign-in was cancelled.";
        } else if (m.startsWith("You need at least")) {
          msg = m;
        } else {
          msg = m.length > 120 ? "Something went wrong. Please try again." : m;
        }
      }
      setError(msg);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="launch a token">
          <PageTransition>
          <div className="w-full sm:max-w-lg space-y-4">
            <div className="text-center space-y-1">
              <AnimatedIcon icon={Coins} size={32} className="text-orange-400" />
              <h1 className="text-2xl font-bold tracking-tight">Launch a token</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">Create a Solana token in seconds.</p>
            </div>

            {
              <div className="space-y-3">
                <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition" />
                <input type="text" placeholder="Ticker (e.g. SOL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={8} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition font-mono" />
                <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition resize-none" />
                
                <label
                  htmlFor="token-image-upload"
                  className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden"
                >
                  {imagePreview ? (
                    <div className="flex items-center gap-3">
                      <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload token image</span>
                  )}
                </label>
                <input id="token-image-upload" ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} className="sr-only" />

                {/* Social links - icon toggles */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 dark:text-white/30">Add links:</span>
                    {[
                      { key: "website", label: "Website", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg> },
                      { key: "twitter", label: "X", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                      { key: "telegram", label: "Telegram", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
                      { key: "instagram", label: "Instagram", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg> },
                      { key: "github", label: "GitHub", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg> },
                      { key: "youtube", label: "YouTube", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
                      { key: "tiktok", label: "TikTok", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg> },
                    ].map(({ key, label, icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const next = new Set(activeSocials);
                          if (next.has(key)) { next.delete(key); } else { next.add(key); }
                          setActiveSocials(next);
                        }}
                        className={`p-2 rounded-lg border transition cursor-pointer ${
                          activeSocials.has(key)
                            ? "bg-orange-500/20 border-orange-400/50 text-orange-400"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60"
                        }`}
                        title={label}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>

                  {activeSocials.has("website") && (
                    <input type="url" placeholder="Website URL" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("twitter") && (
                    <input type="text" placeholder="X handle (e.g. @soldotnew)" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("telegram") && (
                    <input type="text" placeholder="Telegram link or @handle" value={telegram} onChange={(e) => setTelegram(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("instagram") && (
                    <input type="text" placeholder="Instagram handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("github") && (
                    <input type="text" placeholder="GitHub URL or username" value={github} onChange={(e) => setGithub(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("youtube") && (
                    <input type="text" placeholder="YouTube channel URL" value={youtube} onChange={(e) => setYoutube(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                  {activeSocials.has("tiktok") && (
                    <input type="text" placeholder="TikTok handle" value={tiktok} onChange={(e) => setTiktok(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />
                  )}
                </div>

                {/* Supply: 1B, Fee: 1%, Graduation: ~85 SOL, Migration: DAMM v2, LP: 80% creator */}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                {(status === "auth" || status === "uploading" || status === "creating" || status === "confirming") ? (
                  <div className="w-full space-y-3">
                    <div className="relative h-12 overflow-hidden rounded-xl">
                      {/* Rocket moving left to right */}
                      <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{
                        left: status === "auth" ? "8%" : status === "uploading" ? "35%" : status === "creating" ? "65%" : "115%",
                        transition: status === "confirming"
                          ? "left 0.5s cubic-bezier(0.55, 0, 1, 0.45)"
                          : status === "creating"
                          ? "left 0.7s cubic-bezier(0.4, 0, 0.9, 0.4)"
                          : "left 0.9s cubic-bezier(0.25, 0, 0.7, 0.4)",
                      }}>
                        {/* Flame + sparks trailing to the left */}
                        <div className="flex items-center gap-0.5 mr-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="rounded-full animate-pulse" style={{
                              width: `${3 + i}px`,
                              height: `${3 + i}px`,
                              background: i > 2 ? '#f59e0b' : i > 0 ? '#9333ea' : '#6b21a8',
                              opacity: 0.3 + i * 0.15,
                              animationDelay: `${i * 0.08}s`,
                              boxShadow: i > 2 ? '0 0 6px #f59e0b' : '0 0 4px #9333ea',
                            }} />
                          ))}
                        </div>
                        {/* Spark particles scattering behind */}
                        {[...Array(8)].map((_, i) => (
                          <div key={`spark-${i}`} className="absolute rounded-full sol-spark" style={{
                            width: '3px',
                            height: '3px',
                            background: i % 3 === 0 ? '#14f195' : i % 3 === 1 ? '#9945ff' : '#f59e0b',
                            top: `${(i % 2 === 0 ? -1 : 1) * (6 + i * 3)}px`,
                            left: `${-8 - i * 6}px`,
                            animationDelay: `${i * 0.1}s`,
                            boxShadow: `0 0 4px ${i % 3 === 0 ? '#14f195' : i % 3 === 1 ? '#9945ff' : '#f59e0b'}`,
                          }} />
                        ))}
                        {/* Rocket pointing right */}
                        <Rocket className="w-7 h-7 text-orange-500 dark:text-orange-400 rotate-45 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                      </div>
                    </div>
                    <p className="text-center text-sm text-gray-500 dark:text-white/50">
                      {status === "auth" && "Signing in..."}
                      {status === "uploading" && "Uploading image..."}
                      {status === "creating" && "Creating token..."}
                      {status === "confirming" && "Almost there..."}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleLaunch}
                    disabled={!name || !ticker || !imageFile}
                    className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    Launch token
                  </button>
                )}
                <p className="text-center text-xs text-gray-400 dark:text-white/30">~0.03 SOL</p>
              </div>
            }
          </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
