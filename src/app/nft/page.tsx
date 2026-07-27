// @ts-nocheck
"use client";

import { fastIpfsUrl } from "@/lib/ipfs";
import { useState, useRef, useCallback } from "react";
import { PromoInput } from "@/components/promo-input";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useImagePaste } from "@/lib/use-image-paste";
import { Connection, PublicKey } from "@solana/web3.js";
import { Image, Paperclip, Zap, Coins, Check, ExternalLink, ArrowRight } from "lucide-react";
import { friendlyError } from "@/lib/friendly-errors";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { PageTransition, FadeIn } from "@/components/page-transition";

// Metaplex Umi imports
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNft,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  mintV1,
  mplBubblegum,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  generateSigner,
  percentAmount,
  createSignerFromKeypair,
  signerIdentity,
  publicKey,
  none,
  lamports,
  sol,
} from "@metaplex-foundation/umi";
import { transferSol } from "@metaplex-foundation/mpl-toolbox";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

type MintType = "standard" | "compressed";

export default function NftPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mintType, setMintType] = useState<MintType>("standard");
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
  const [copied, setCopied] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { publicKey: walletPk, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();

  const acceptImage = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptImage(file);
  };
  useImagePaste(acceptImage);

  const handleMint = async () => {
    if (!name || !imageFile || !walletPk) return;
    setError(null);

    try {
      // Step 1: Authenticate with passkey
      setStatus("minting");
      const { address, keypair: userKeypair } = await getPasskeyKeypair();

      const qty = Math.max(1, Math.min(100, quantity || 1));

      // Fund user's wallet via treasury when a promo code is active
      if (promoCode) {
        const fundKind = mintType === "standard" ? "nft_standard" : "nft_compressed";
        const fundRes = await fetch("/api/promo/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: fundKind, quantity: qty }),
        });
        if (!fundRes.ok) {
          const err = await fundRes.json().catch(() => ({}));
          throw new Error(err.error ?? "Promo funding failed — please try again.");
        }
      }

      // Check balance BEFORE uploads so we don't burn storage on a doomed mint.
      if (!promoCode) {
        const balanceCheckConn = new Connection(rpc, "confirmed");
        const userBalance = await balanceCheckConn.getBalance(new PublicKey(address));
        const perMint = mintType === "standard" ? 0.025 : 0.002;
        const minBalance = perMint * qty * 1e9;
        if (userBalance < minBalance) {
          const need = (perMint * qty).toFixed(3);
          const where = network === "devnet"
            ? "Claim devnet SOL from the Get page."
            : "Add funds from the Get page.";
          const shortAddr = `${address.slice(0, 4)}...${address.slice(-4)}`;
          throw new Error(`You need at least ${need} SOL to mint ${qty} ${mintType} NFT${qty > 1 ? "s" : ""}. Wallet ${shortAddr} has ${(userBalance / 1e9).toFixed(4)} SOL on ${network}. ${where}`);
        }
      }

      // Step 2: Upload image + metadata
      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const imageUrl = uploaded.url;
      const displayUrl = uploaded.preview;
      const metadata = await uploadMetadata({
        name,
        symbol: "NFT",
        description,
        image: imageUrl,
      });
      const metadataUri = metadata.uri;

      // Step 3: Create Umi instance
      setStatus("minting");
      const umi = createUmi(rpc);
      const umiKeypair = fromWeb3JsKeypair(userKeypair);
      const signer = createSignerFromKeypair(umi, umiKeypair);
      umi.use(signerIdentity(signer));

      let mintAddress: string | undefined;
      let assetId: string | undefined;
      let signature: string = "";

      const FEE_VAULT = publicKey("Deqi6CBfo2FR2XVZXxSwmcjELy1JdbAXWDNFPzDAbtxW");
      const allMints: string[] = [];

      if (mintType === "standard") {
        umi.use(mplTokenMetadata());
        // Standard NFT pricing: 0.02 SOL total = 0.015 rent + 0.005 platform fee
        const platformFee = sol(0.005);

        if (qty > 1) setProgress({ done: 0, total: qty });
        for (let i = 0; i < qty; i++) {
          const mint = generateSigner(umi);
          const nftBuilder = createNft(umi, {
            mint,
            name: qty > 1 ? `${name} #${i + 1}` : name,
            symbol: "NFT",
            uri: metadataUri,
            sellerFeeBasisPoints: percentAmount(0),
            isMutable: false,
          });
          if (!promoCode) nftBuilder.add(transferSol(umi, { source: umi.identity, destination: FEE_VAULT, amount: platformFee }));
          const txResult = await nftBuilder.sendAndConfirm(umi);
          allMints.push(mint.publicKey.toString());
          if (i === 0) signature = Buffer.from(txResult.signature).toString("base64");
          if (qty > 1) setProgress({ done: i + 1, total: qty });
        }
        mintAddress = allMints[0];
      } else {
        // Compressed NFTs via Helius. Single platform fee covers the batch.
        if (!promoCode) {
          const platformFee = sol(0.001 * qty);
          const feeTx = await transferSol(umi, {
            source: umi.identity,
            destination: FEE_VAULT,
            amount: platformFee,
          }).sendAndConfirm(umi);
          signature = Buffer.from(feeTx.signature).toString("base64");
        }

        if (qty > 1) setProgress({ done: 0, total: qty });
        for (let i = 0; i < qty; i++) {
          const res = await fetch("/api/mint-nft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              compressed: true,
              owner: address,
              name: qty > 1 ? `${name} #${i + 1}` : name,
              symbol: "NFT",
              uri: metadataUri,
              description,
              network,
            }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || "Compressed mint failed");
          allMints.push(data.assetId || "pending");
          if (i === 0 && !signature) signature = data.signature || "";
          if (qty > 1) setProgress({ done: i + 1, total: qty });
        }
        assetId = allMints[0];
      }
      setProgress(null);

      // Save each minted NFT to DB
      for (let i = 0; i < allMints.length; i++) {
        fetch("/api/nft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: address,
            name: qty > 1 ? `${name} #${i + 1}` : name,
            description,
            imageUrl,
            metadataUri,
            mintAddress: allMints[i],
          }),
        }).catch(() => {});
      }

      if (promoCode) {
        fetch("/api/promo/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: `nft_${mintType}` }),
        }).catch(() => {});
      }

      setResult({ imageUrl: displayUrl, metadataUri, mint: mintAddress, assetId, signature, type: mintType });
      setStatus("done");
      await refreshBalance();
    } catch (e: any) {
      setError(friendlyError(e, "We couldn't mint your NFT. Please try again."));
      setStatus("error");
      setProgress(null);
    }
  };

  const explorerBase = "https://orbmarkets.io";
  const clusterParam = network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="mint an NFT">
          <PageTransition>
          <div className="w-full sm:max-w-lg space-y-4">
            <div className="text-center space-y-1">
              <AnimatedIcon icon={Image} size={32} className="text-green-400" />
              <h1 className="text-2xl font-bold tracking-tight">Mint an NFT</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">Turn any image into a Solana NFT.</p>
            </div>

            {status === "done" && result ? (
              <FadeIn><div className="space-y-4">
                <div className="bg-black/5 dark:bg-white/5 border border-green-500/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <Check className="w-4 h-4 inline" /> {quantity > 1 ? `${quantity} ${result.type === "compressed" ? "compressed" : "standard"} NFTs minted!` : `${result.type === "compressed" ? "Compressed" : "Standard"} NFT minted!`}
                  </div>
                  <div className="flex gap-4 items-start">
                    {result.imageUrl && (
                      <img src={fastIpfsUrl(result.imageUrl) || result.imageUrl} alt={name} className="w-20 h-20 rounded-xl object-cover" />
                    )}
                    <div>
                      <p className="text-gray-900 dark:text-white font-semibold">{name}</p>
                      {description && <p className="text-gray-500 dark:text-white/40 text-sm">{description}</p>}
                    </div>
                  </div>
                  {result.mint && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-white/40">Mint address</p>
                      <a
                        href={`${explorerBase}/address/${result.mint}${clusterParam}`}
                        target="_blank"
                        className="text-green-400 text-sm break-all hover:text-green-300"
                      >
                        {result.mint}
                      </a>
                    </div>
                  )}
                  {result.assetId && result.assetId !== "pending" && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-white/40">Asset ID</p>
                      <p className="text-green-400 text-sm break-all">{result.assetId}</p>
                    </div>
                  )}
                  {result.metadataUri && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-white/40">Metadata</p>
                      <a href={result.metadataUri} target="_blank" className="text-green-400 text-sm break-all hover:text-green-300">
                        {result.metadataUri}
                      </a>
                    </div>
                  )}
                </div>

                {/* View NFT button */}
                {result.mint && (
                  <a
                    href={`${explorerBase}/address/${result.mint}${clusterParam}`}
                    target="_blank"
                    className="flex items-center justify-center gap-1.5 w-full bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl px-4 py-3.5 transition text-center"
                  >
                    View your NFT on Orb <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
                  </a>
                )}

                {/* Copy link */}
                <button
                  onClick={() => {
                    const id = result.mint || (result.assetId && result.assetId !== "pending" ? result.assetId : "");
                    if (!id) return;
                    const url = `${explorerBase}/address/${id}${clusterParam}`;
                    navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`flex items-center justify-center gap-1.5 w-full border rounded-xl px-4 py-3 transition cursor-pointer ${
                    copied
                      ? "bg-green-500/15 border-green-400/40 text-green-500 dark:text-green-400"
                      : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {copied ? (
                    <><Check className="w-4 h-4" /> Copied!</>
                  ) : (
                    "Copy link to share"
                  )}
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
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                >
                  Mint another
                </button>
              </div></FadeIn>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="NFT name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-green-400/50 focus:ring-1 focus:ring-green-400/25 transition"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-green-400/50 focus:ring-1 focus:ring-green-400/25 transition resize-none"
                />

                <label
                  htmlFor="nft-image-upload"
                  className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden"
                >
                  {imagePreview ? (
                    <div className="flex items-center gap-3">
                      <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                      <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-white/30 text-sm">
                      <Paperclip size={14} className="inline mr-1" /> Tap to upload or paste an image
                    </span>
                  )}
                </label>
                <input id="nft-image-upload" ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} className="sr-only" />

                {/* Mint type toggle */}
                <div className="flex gap-2">
                  {(["standard", "compressed"] as MintType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMintType(t)}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                        mintType === t
                          ? "bg-green-500/20 border-green-400/50 text-green-300"
                          : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white hover:border-black/20 dark:hover:border-white/20"
                      }`}
                    >
                      {t === "standard"
                        ? <><Coins size={14} className="inline mr-1" /> Standard</>
                        : <><Zap size={14} className="inline mr-1" /> Compressed</>}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-white/30 text-center">
                  {mintType === "standard"
                    ? "Standard — full onchain metadata"
                    : "Compressed — cheaper, great for collections"}
                </p>

                {/* Quantity */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-500 dark:text-white/40 block">How many copies?</label>
                  <div className="flex gap-2 items-stretch">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer text-lg font-semibold disabled:opacity-30"
                      disabled={quantity <= 1}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={quantity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (isNaN(v)) setQuantity(1);
                        else setQuantity(Math.max(1, Math.min(100, v)));
                      }}
                      className="flex-1 text-center text-base font-semibold bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-green-400/50 focus:ring-1 focus:ring-green-400/25 transition tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.min(100, quantity + 1))}
                      className="w-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer text-lg font-semibold disabled:opacity-30"
                      disabled={quantity >= 100}
                    >
                      +
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {[1, 5, 10, 25, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQuantity(n)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition cursor-pointer ${
                          quantity === n
                            ? "bg-green-500/20 border border-green-400/50 text-green-400"
                            : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {quantity > 1 && (
                    <p className="text-[11px] text-gray-400 dark:text-white/40 text-center">
                      Each NFT will be named &quot;{name || "Your NFT"} #1&quot;, &quot;#2&quot;, etc.
                    </p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <PromoInput
                  onValidCode={setPromoCode}
                  onClear={() => setPromoCode(null)}
                />

                <button
                  onClick={handleMint}
                  disabled={!name || !imageFile || status === "uploading" || status === "minting"}
                  className="w-full bg-green-500 hover:bg-green-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {status === "uploading"
                    ? <><Spinner size={16} className="inline mr-2" />Uploading...</>
                    : status === "minting"
                    ? progress
                      ? <><Spinner size={16} className="inline mr-2" />Minting {progress.done}/{progress.total}…</>
                      : <><Spinner size={16} className="inline mr-2" />Minting onchain...</>
                    : quantity > 1
                    ? `Mint ${quantity} ${mintType} NFTs`
                    : `Mint ${mintType} NFT`}
                </button>
                <p className="text-center text-xs text-gray-400 dark:text-white/30">
                  {promoCode
                    ? <span className="text-green-400">Free with promo code</span>
                    : `${((mintType === "standard" ? 0.02 : 0.001) * quantity).toFixed(3)} SOL${quantity > 1 ? ` (${(mintType === "standard" ? 0.02 : 0.001).toFixed(3)} × ${quantity})` : ""}`}
                </p>
              </div>
            )}
          </div>
          </PageTransition>
        </ConnectGate>

        <div className="w-full sm:max-w-lg pt-6 pb-2 space-y-2">
          <p className="text-center text-xs text-gray-400 dark:text-white/30">Looking to buy NFTs instead?</p>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="https://magiceden.io/solana"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 dark:text-white/60 hover:text-pink-500 dark:hover:text-pink-400 hover:border-pink-400/40 transition"
            >
              Magic Eden <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://www.tensor.trade"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 dark:text-white/60 hover:text-sky-500 dark:hover:text-sky-400 hover:border-sky-400/40 transition"
            >
              Tensor <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
