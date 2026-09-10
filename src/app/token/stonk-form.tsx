"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Connection, Transaction } from "@solana/web3.js";
import { AnimatedIcon } from "@/components/animated-icon";
import { PageTransition } from "@/components/page-transition";
import { useImagePaste } from "@/lib/use-image-paste";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { analytics } from "@/lib/analytics";
import { friendlyError } from "@/lib/friendly-errors";
import { extractPairs, type StonkPair } from "@/lib/stonkfun";
import { TokenSocials, useTokenSocials } from "@/components/token-socials";
import { uploadImage, uploadMetadata, madeAtSolNew } from "@/lib/api";

const STONK_LINKS = ["website", "twitter", "telegram"] as const;
const MINT_KINDS = ["STNK", "NEW", "random"] as const;
type MintKind = (typeof MINT_KINDS)[number];
const ac = {
  text: "text-emerald-400",
  btn: "bg-emerald-500 hover:bg-emerald-400",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export default function StonkForm({ onBack }: { onBack?: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const socials = useTokenSocials([...STONK_LINKS]);
  const [pairs, setPairs] = useState<StonkPair[]>([]);
  const [pairsBusy, setPairsBusy] = useState(true);
  const [pairQ, setPairQ] = useState("");
  const [quoteMint, setQuoteMint] = useState("");
  const [mintKind, setMintKind] = useState<MintKind>("random");
  const [status, setStatus] = useState<
    "idle" | "auth" | "preparing" | "signing" | "creating" | "submitting" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { publicKey, refreshBalance } = useWallet();
  const { network, toggle, rpc } = useNetwork();

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  useImagePaste(acceptImage);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPairsBusy(true);
      const apply = (list: StonkPair[]) => {
        if (cancelled) return;
        setPairs(list);
        const pref =
          list.find((p) => p.symbol === "NVDAx") ||
          list.find((p) => p.symbol === "SPYx") ||
          list[0];
        if (pref) setQuoteMint(pref.mint);
      };
      try {
        const res = await fetch("/api/stonk/pairs");
        const json = (await res.json()) as { ok?: boolean; error?: string; pairs?: StonkPair[] };
        if (json.ok && json.pairs?.length) {
          apply(json.pairs);
          return;
        }
        throw new Error(json.error || "pairs failed");
      } catch {
        try {
          const res = await fetch("https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true&pageSize=100");
          const raw = await res.json();
          const list = extractPairs(raw);
          if (!list.length) throw new Error("empty");
          apply(list);
        } catch (e) {
          if (!cancelled) setError(friendlyError(e, "Could not load pairs."));
        }
      } finally {
        if (!cancelled) setPairsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPairs = useMemo(() => {
    const q = pairQ.trim().toLowerCase();
    if (!q) return pairs;
    return pairs.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        (p.name || "").toLowerCase().includes(q) ||
        p.mint.toLowerCase().includes(q),
    );
  }, [pairs, pairQ]);

  const selectedPair = pairs.find((p) => p.mint === quoteMint);

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile || !publicKey || !quoteMint) return;
    if (network !== "mainnet") {
      setError("StonkFun is mainnet. Switch to live.");
      return;
    }
    setError(null);
    analytics.launchInitiated(ticker, "stonk");
    let claimedMint = "";
    try {
      setStatus("auth");
      const { keypair } = await getPasskeyKeypair();

      if (mintKind === "STNK" || mintKind === "NEW") {
        setStatus("preparing");
        const claimed = (await (
          await fetch("/api/stonk/vanity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: mintKind }),
          })
        ).json()) as { ok?: boolean; error?: string; mint?: string };
        if (!claimed.ok || !claimed.mint) {
          throw new Error(claimed.error || "Could not claim mint");
        }
        claimedMint = claimed.mint;
        const priceRes = await fetch(`/api/stonk/pricing?quoteMint=${encodeURIComponent(quoteMint)}`);
        const priceJson = (await priceRes.json()) as {
          ok?: boolean;
          error?: string;
          pricing?: {
            raise?: { raw?: string };
            curve?: { configId?: string };
            platform?: { standard?: string };
          };
        };
        if (!priceJson.ok || !priceJson.pricing?.curve?.configId) {
          throw new Error(priceJson.error || "No LaunchLab pricing for that pair");
        }
        setStatus("creating");
        const uploaded = await uploadImage(imageFile);
        const metadata = await uploadMetadata({
          name,
          symbol: ticker,
          description,
          image: uploaded.url,
          ...socials.filled,
        });
        const { createLaunchLabTx } = await import("@/lib/launchlab");
        const { mint } = await createLaunchLabTx({
          connection: new Connection(rpc, "confirmed"),
          owner: keypair,
          name,
          symbol: ticker,
          uri: metadata.uri,
          mintPubkey: claimedMint,
          configId: priceJson.pricing.curve.configId,
          platformId: priceJson.pricing.platform?.standard,
          raiseRaw: priceJson.pricing.raise?.raw,
        });
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
        return;
      }

      setStatus("preparing");
      const logo = await fileToDataUrl(imageFile);
      const prepRes = await fetch("/api/stonk/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorWallet: publicKey,
          quoteMint,
          name,
          symbol: ticker,
          mode: "standard",
          logo,
          description: madeAtSolNew(description),
          ...socials.filled,
        }),
      });
      const prepared = (await prepRes.json()) as {
        ok?: boolean;
        error?: string;
        paymentTransaction?: string;
        signedQuote?: string;
      };
      if (!prepared.ok || !prepared.paymentTransaction) {
        throw new Error(prepared.error || "Prepare failed");
      }
      setStatus("signing");
      const tx = Transaction.from(Buffer.from(prepared.paymentTransaction, "base64"));
      tx.partialSign(keypair);
      const signedTransaction = Buffer.from(tx.serialize()).toString("base64");
      setStatus("submitting");
      let result = (await (
        await fetch("/api/stonk/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedQuote: prepared.signedQuote,
            signedTransaction,
            logo,
          }),
        })
      ).json()) as {
        ok?: boolean;
        error?: string;
        status?: string;
        mint?: string;
        paymentSignature?: string;
      };
      if (!result.ok) throw new Error(result.error || "Submit failed");
      let mint = result.mint;
      let paymentSignature = result.paymentSignature;
      let loops = 0;
      while (result.status === "processing" && loops < 24) {
        await sleep(5000);
        loops += 1;
        const sig = paymentSignature || result.paymentSignature;
        if (!sig) break;
        const poll = await fetch(`/api/stonk/launches/${sig}`);
        result = (await poll.json()) as typeof result;
        if (result.mint) mint = result.mint;
        if (result.paymentSignature) paymentSignature = result.paymentSignature;
      }
      if (!mint) throw new Error("Launch is still processing. Do not pay again.");
      await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          name,
          symbol: ticker,
          description,
          mintAddress: mint,
          network: "mainnet",
        }),
      }).catch(() => {});
      await refreshBalance();
      analytics.tokenCreated(mint, ticker);
      router.push(`/launch/${mint}`);
    } catch (e: unknown) {
      if (claimedMint && (mintKind === "STNK" || mintKind === "NEW")) {
        fetch("/api/stonk/vanity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: mintKind, releaseMint: claimedMint }),
        }).catch(() => {});
      }
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
          {onBack && (
            <button
              onClick={onBack}
              className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <AnimatedIcon icon={TrendingUp} size={32} className={ac.text} />
          <h1 className="text-2xl font-bold tracking-tight">StonkFun</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">
            Pair a new coin with stocks, SOL, or another mint. LaunchLab curve.{" "}
            <a href="/stonks" className="text-emerald-500 underline">
              Top stonks
            </a>
          </p>
        </div>

        {network !== "mainnet" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 space-y-2 text-sm">
            <p className="font-semibold">StonkFun is mainnet</p>
            <button
              type="button"
              onClick={() => toggle()}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3.5 py-2"
            >
              Switch to live
            </button>
          </div>
        )}

        <div className="space-y-3">
          <label className="block text-xs text-gray-400">Quote pair</label>
          <input
            type="search"
            value={pairQ}
            onChange={(e) => setPairQ(e.target.value)}
            placeholder="Filter: NVDAx, SPYx, SOL, mint"
            disabled={busy || pairsBusy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 disabled:opacity-50"
          />
          {selectedPair && (
            <p className="text-xs text-emerald-500">
              Selected {selectedPair.symbol}
              {selectedPair.name && selectedPair.name !== selectedPair.symbol ? ` · ${selectedPair.name}` : ""}
            </p>
          )}
          <div className="max-h-40 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5">
            {pairsBusy && <p className="px-4 py-3 text-sm text-gray-400">Loading pairs</p>}
            {!pairsBusy && filteredPairs.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-400">No match</p>
            )}
            {filteredPairs.slice(0, 60).map((p) => (
              <button
                key={p.mint}
                type="button"
                disabled={busy}
                onClick={() => setQuoteMint(p.mint)}
                className={`w-full text-left px-4 py-2.5 text-sm ${
                  quoteMint === p.mint
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span className="font-semibold">{p.symbol}</span>
                {p.name && p.name !== p.symbol ? (
                  <span className="text-gray-400"> · {p.name}</span>
                ) : null}
              </button>
            ))}
          </div>
          {filteredPairs.length > 60 && (
            <p className="text-xs text-gray-400">{filteredPairs.length} matches. Type more to narrow.</p>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-2">Mint</p>
            <div className="grid grid-cols-3 gap-2">
              {MINT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => setMintKind(k)}
                  className={`py-2 rounded-xl text-sm border transition cursor-pointer ${
                    mintKind === k
                      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400"
                      : "border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40"
                  }`}
                >
                  {k === "random" ? "Random" : k}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {mintKind === "STNK" && "Mint ends with STNK. LaunchLab vs your quote."}
              {mintKind === "NEW" && "Mint starts with NEW. LaunchLab vs your quote."}
              {mintKind === "random" && "StonkFun assigns the mint."}
            </p>
          </div>
          <input
            type="text"
            placeholder="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 disabled:opacity-50"
          />
          <input
            type="text"
            placeholder="Ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={10}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 font-mono disabled:opacity-50"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 resize-none disabled:opacity-50"
          />
          <label
            htmlFor="stonk-image"
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
            id="stonk-image"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptImage(f);
            }}
            className="sr-only"
          />
          <TokenSocials socials={socials} accent="emerald" disabled={busy} />
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {busy ? (
            <p className="text-center text-sm text-gray-500 dark:text-white/50">
              {status === "auth" && "Signing in"}
              {status === "preparing" && "Preparing mint"}
              {status === "creating" && "Creating on LaunchLab"}
              {status === "signing" && "Face ID"}
              {status === "submitting" && "Submitting bundle"}
            </p>
          ) : (
            <>
              <button
                onClick={() => void handleLaunch()}
                disabled={!name || !ticker || !imageFile || !publicKey || !quoteMint}
                className={`w-full min-h-12 ${ac.btn} disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 text-black font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed`}
              >
                Launch on StonkFun
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-white/30">
                Standard mode. 1% pool, creator gets 0.5%. Fee quoted by StonkFun.
              </p>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
