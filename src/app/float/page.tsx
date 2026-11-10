"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Search,
  Waves,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useImagePaste } from "@/lib/use-image-paste";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { broadcastSignedTx } from "@/lib/broadcast-tx";
import { analytics } from "@/lib/analytics";
import { addressPath, txPath } from "@/lib/explorer";
import { floatLaunchSharePayload } from "@/lib/share-copy";
import { FLOAT_TOKEN_URL, VANITY_SUFFIX } from "@/lib/float/constants";
import { decodeTickerRecord } from "@/lib/float/codec";
import { explainFloatError } from "@/lib/float/errors";
import { buildLaunchInstruction } from "@/lib/float/instruction";
import { coinMintPda, tickerPda } from "@/lib/float/pdas";
import { readLaunchChainState } from "@/lib/float/read";
import {
  lamportsToSolString,
  quoteTakeover,
  solStringToLamports,
  type TakeoverQuote,
} from "@/lib/float/takeover";
import { metadataUriError, nameError, tickerError } from "@/lib/float/validate";
import type { FloatCatalog, FloatQuoteView } from "@/lib/float/catalog";

const FIELD =
  "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/25 transition disabled:opacity-50";

const RENT_LAMPORTS = BigInt(40_000_000);

type Result = {
  mint: string;
  signature: string;
  name: string;
  ticker: string;
  quoteSymbol: string;
};

function bpsLabel(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

function randomNonce(): bigint {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export default function FloatPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <PageTransition>
        <FloatLaunch />
      </PageTransition>
    </div>
  );
}

function FloatLaunch() {
  const { publicKey, connect, refreshBalance } = useWallet();
  const { network, rpc, toggle, rotateMainnetRpc } = useNetwork();
  const [catalog, setCatalog] = useState<FloatCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [quote, setQuote] = useState<FloatQuoteView | null>(null);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);

  const [tier, setTier] = useState(0);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [feeReceiver, setFeeReceiver] = useState("");
  const [cap, setCap] = useState("0");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [preview, setPreview] = useState<TakeoverQuote | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);

  const [vanity, setVanity] = useState(false);
  const [vanityKp, setVanityKp] = useState<Keypair | null>(null);
  const [vanityTried, setVanityTried] = useState(0);

  const [status, setStatus] = useState<"idle" | "auth" | "uploading" | "creating" | "confirming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const feeTouched = useRef(false);
  const capTouched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  useImagePaste(acceptImage);

  useEffect(() => {
    if (publicKey && !feeTouched.current) setFeeReceiver(publicKey);
  }, [publicKey]);

  useEffect(() => {
    let cancel = false;
    fetch("/api/float/quotes")
      .then(async (r) => {
        const data = (await r.json()) as FloatCatalog & { error?: string };
        if (!r.ok) throw new Error(data.error || "Couldn't load quote tokens");
        return data;
      })
      .then((data) => {
        if (cancel) return;
        setCatalog(data);
        setCatalogError(null);
        setQuote((cur) => {
          if (cur) return cur;
          return (
            data.quotes.find((q) => q.symbol.toUpperCase() === "SOL") ||
            data.quotes.find((q) => q.symbol.toUpperCase() === "USDC") ||
            null
          );
        });
        if (data.tiers[0]) setTier(data.tiers[0].index);
      })
      .catch((e) => {
        if (!cancel) setCatalogError(e instanceof Error ? e.message : "Couldn't load quote tokens");
      })
      .finally(() => {
        if (!cancel) setCatalogLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!vanity) return;
    const ac = new AbortController();
    let tried = 0;
    (async () => {
      while (!ac.signal.aborted) {
        for (let i = 0; i < 60; i++) {
          const kp = Keypair.generate();
          tried++;
          if (kp.publicKey.toBase58().endsWith(VANITY_SUFFIX)) {
            if (!ac.signal.aborted) {
              setVanityKp(kp);
              setVanityTried(tried);
            }
            return;
          }
        }
        if (tried % 3000 < 60) setVanityTried(tried);
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return () => ac.abort();
  }, [vanity]);

  useEffect(() => {
    if (!catalog) return;
    if (tickerError(ticker)) {
      setPreview(null);
      setPreviewNote(null);
      return;
    }
    let cancel = false;
    const handle = setTimeout(() => {
      const connection = new Connection(rpc, "confirmed");
      connection
        .getAccountInfo(tickerPda(ticker.trim()))
        .then((info) => {
          if (cancel) return;
          const rec = info ? decodeTickerRecord(info.data) : null;
          const q = quoteTakeover({
            config: {
              tickerTakeoverLamports: BigInt(catalog.takeoverFlatLamports),
              tickerProtectSecs: BigInt(catalog.protectSecs),
            },
            ticker: rec,
            nowSecs: Date.now() / 1000,
          });
          setPreview(q);
          setPreviewNote(null);
          if (!capTouched.current) setCap(lamportsToSolString(q.lamports));
        })
        .catch(() => {
          if (!cancel) setPreviewNote("Couldn't check this ticker on-chain. You can still launch — the cap below is what you'll agree to pay.");
        });
    }, 400);
    return () => {
      cancel = true;
      clearTimeout(handle);
    };
  }, [ticker, catalog, rpc]);

  const shownQuotes = useMemo(() => {
    const quotes = catalog?.quotes ?? [];
    const q = quoteQuery.trim().toLowerCase();
    const list = q
      ? quotes.filter(
          (item) =>
            item.symbol.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.mint.toLowerCase().includes(q),
        )
      : quotes;
    return { items: list.slice(0, q ? 40 : 20), total: quotes.length };
  }, [catalog, quoteQuery]);

  const busy = status === "auth" || status === "uploading" || status === "creating" || status === "confirming";
  const split = catalog?.feeSplit;

  const launch = async () => {
    setError(null);
    if (network !== "mainnet") {
      setError("Float launches are on mainnet. Switch networks, then launch.");
      return;
    }
    const nameMsg = nameError(name);
    const tickMsg = tickerError(ticker);
    if (nameMsg || tickMsg) {
      setError(nameMsg || tickMsg);
      return;
    }
    if (!quote) {
      setError("Pick an enabled quote token.");
      return;
    }
    if (!metadataUri.trim() && !imageFile) {
      setError("Add an image or a metadata URI.");
      return;
    }
    let receiver: PublicKey;
    try {
      receiver = new PublicKey(feeReceiver.trim());
    } catch {
      setError("Fee receiver must be a Solana address.");
      return;
    }
    if (vanity && !vanityKp) {
      setError("Still searching for an address ending in fLoat. Switch off vanity to launch now.");
      return;
    }
    if (!publicKey) {
      await connect();
      return;
    }
    const wallet = publicKey;

    analytics.launchInitiated(ticker.trim(), "float");
    try {
      setStatus("creating");
      const connection = new Connection(rpc, "confirmed");
      const chain = await readLaunchChainState(connection, new PublicKey(quote.mint), ticker.trim());
      if (chain.config.launchesPaused) {
        throw new Error("Float has paused new launches. Coins already live can still trade. Try again later.");
      }
      if (!chain.quote.enabled) {
        throw new Error("That quote token is turned off for new launches. Pick another enabled asset.");
      }
      const tierRow = chain.config.tierFeeRates[tier];
      const platform = chain.config.platforms[tier];
      if (tierRow == null || !platform || platform.equals(PublicKey.default)) {
        throw new Error("That fee tier isn't available. Pick one of the tiers shown.");
      }
      const live = quoteTakeover({
        config: chain.config,
        ticker: chain.ticker,
        nowSecs: Date.now() / 1000,
      });
      if (live.protected) {
        throw new Error("That ticker is still protected and can't be taken over yet. Wait, or pick another ticker.");
      }
      const parsedCap = cap.trim() === "" ? null : solStringToLamports(cap);
      if (cap.trim() !== "" && parsedCap == null) {
        throw new Error("Takeover cap must be a SOL amount, like 0 or 2.");
      }
      const maxTakeover = parsedCap ?? live.lamports;
      if (!live.free && maxTakeover < live.lamports) {
        throw new Error(
          `Taking over $${ticker.trim().toUpperCase()} costs ${lamportsToSolString(live.lamports)} SOL right now, above your cap of ${lamportsToSolString(maxTakeover)} SOL. Raise the cap or pick another ticker.`,
        );
      }
      const need = RENT_LAMPORTS + maxTakeover;
      const balance = BigInt(await connection.getBalance(new PublicKey(wallet)));
      if (balance < need) {
        throw new Error(
          `You need about ${lamportsToSolString(need)} SOL (rent${maxTakeover > BigInt(0) ? " + ticker takeover" : ""}). Your balance is ${lamportsToSolString(balance)} SOL. Add SOL from Get funds.`,
        );
      }

      setStatus("auth");
      const { keypair: userKeypair } = await getPasskeyKeypair();
      const user = userKeypair.publicKey;

      setStatus("uploading");
      let uri = metadataUri.trim();
      let imageUrl = "";
      if (!uri) {
        const uploaded = await uploadImage(imageFile!);
        imageUrl = uploaded.url;
        const meta = await uploadMetadata({
          name: name.trim(),
          symbol: ticker.trim(),
          description: description.trim(),
          image: imageUrl,
        });
        uri = meta.uri;
      }
      const uriMsg = metadataUriError(uri);
      if (uriMsg) throw new Error(uriMsg);

      setStatus("creating");
      const fresh = await readLaunchChainState(connection, new PublicKey(quote.mint), ticker.trim());
      const freshTakeover = quoteTakeover({
        config: fresh.config,
        ticker: fresh.ticker,
        nowSecs: Date.now() / 1000,
      });
      if (fresh.config.launchesPaused) {
        throw new Error("Float has paused new launches. Coins already live can still trade. Try again later.");
      }
      if (!fresh.quote.enabled) {
        throw new Error("That quote token is turned off for new launches. Pick another enabled asset.");
      }
      const freshPlatform = fresh.config.platforms[tier];
      if (!freshPlatform || freshPlatform.equals(PublicKey.default)) {
        throw new Error("That fee tier isn't available. Pick one of the tiers shown.");
      }
      if (freshTakeover.protected) {
        throw new Error("That ticker is still protected and can't be taken over yet. Wait, or pick another ticker.");
      }
      if (!freshTakeover.free && maxTakeover < freshTakeover.lamports) {
        throw new Error(
          `The takeover price moved to ${lamportsToSolString(freshTakeover.lamports)} SOL, above your cap of ${lamportsToSolString(maxTakeover)} SOL. Nothing was sent. Raise the cap and try again.`,
        );
      }

      const keyed = Boolean(vanity && vanityKp);
      const mintNonce = keyed ? BigInt(0) : randomNonce();
      const coinMint = keyed ? vanityKp!.publicKey : coinMintPda(user, mintNonce);
      const ix = buildLaunchInstruction({
        creator: user,
        treasury: fresh.config.treasury,
        quoteMint: new PublicKey(quote.mint),
        quoteTokenProgram: fresh.quoteTokenProgram,
        globalConfig: fresh.quote.globalConfig,
        platformConfig: freshPlatform,
        name: name.trim(),
        ticker: ticker.trim(),
        uri,
        feeReceiver: receiver,
        feeTier: tier,
        mintNonce,
        coinMint,
        keyed,
        maxTakeoverLamports: maxTakeover,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: user, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ix);
      if (keyed && vanityKp) tx.partialSign(vanityKp);
      tx.partialSign(userKeypair);

      const signature = await broadcastSignedTx(tx, { rpc, rotateMainnetRpc });
      setStatus("confirming");
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      const mint = coinMint.toBase58();
      fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: user.toBase58(),
          name: name.trim(),
          symbol: ticker.trim(),
          description: description.trim(),
          imageUrl,
          metadataUri: uri,
          mintAddress: mint,
          network: "mainnet",
        }),
      }).catch(() => {});

      await refreshBalance();
      analytics.launchCompleted(mint, ticker.trim(), "float");
      setResult({
        mint,
        signature,
        name: name.trim(),
        ticker: ticker.trim(),
        quoteSymbol: quote.symbol,
      });
      setStatus("idle");
    } catch (e) {
      analytics.launchFailed(ticker.trim(), String(e).slice(0, 120));
      setError(explainFloatError(e));
      setStatus("error");
    }
  };

  if (result) {
    const share = floatLaunchSharePayload({
      name: result.name,
      symbol: result.ticker,
      mint: result.mint,
      quoteSymbol: result.quoteSymbol,
    });
    return (
      <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-8 space-y-5">
        <div className="text-center space-y-2">
          <Waves className="w-8 h-8 text-cyan-500 mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">{result.name} is live</h1>
          <p className="text-sm text-gray-500 dark:text-white/50">
            ${result.ticker} is paired with {result.quoteSymbol}. Next: open the coin on Float and trade it.
            Holders earn {result.quoteSymbol} from fees.
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-white/40">Mint</div>
          <div className="flex items-start gap-2">
            <code className="text-sm break-all font-mono">{result.mint}</code>
            <button
              type="button"
              className="shrink-0 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                navigator.clipboard.writeText(result.mint).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }).catch(() => {});
              }}
              aria-label="Copy mint"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <a
            href={FLOAT_TOKEN_URL(result.mint)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold py-3.5"
          >
            Open the coin on Float <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            className="rounded-xl border border-black/10 dark:border-white/10 py-3 font-medium"
            onClick={() => {
              const go = () => navigator.clipboard.writeText(`${share.text}`);
              if (navigator.share) {
                navigator.share({ title: share.title, text: share.text, url: share.url }).catch(() => go());
              } else {
                go().catch(() => {});
              }
              analytics.shareClicked("float", share.url);
            }}
          >
            Share
          </button>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            <Link href={`/token/${result.mint}`} className="text-cyan-600 dark:text-cyan-400 hover:underline">
              Coin page
            </Link>
            <Link href={addressPath(result.mint)} className="text-cyan-600 dark:text-cyan-400 hover:underline">
              Address
            </Link>
            <Link href={txPath(result.signature)} className="text-cyan-600 dark:text-cyan-400 hover:underline">
              Receipt
            </Link>
          </div>
        </div>
        <button
          type="button"
          className="w-full text-sm text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white"
          onClick={() => {
            setResult(null);
            setVanity(false);
            setVanityKp(null);
            setVanityTried(0);
          }}
        >
          Launch another
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <div className="text-center space-y-1">
        <Waves className="w-8 h-8 text-cyan-500 mx-auto" />
        <h1 className="text-2xl font-bold tracking-tight">Launch on Float</h1>
        <p className="text-gray-500 dark:text-white/50 text-sm">
          A coin through Float&apos;s program, paired with a quote they already enabled. Trading fees split to holders, you, and Float.
        </p>
      </div>

      <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
        The Float program is unaudited and upgradeable by their team. They can pause launches or disable a quote asset.
      </p>

      {network !== "mainnet" && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-3 text-sm space-y-2">
          <p>Float runs on mainnet. Switch networks to reach their program.</p>
          <button type="button" onClick={toggle} className="text-cyan-600 dark:text-cyan-400 font-medium">
            Switch to mainnet
          </button>
        </div>
      )}

      {catalog?.launchesPaused && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          Float has paused new launches. You can look around. A launch lands after they turn it back on.
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-white/50">Quote token</label>
          <button
            type="button"
            disabled={busy || catalogLoading}
            onClick={() => setQuoteOpen((v) => !v)}
            className={`${FIELD} text-left flex items-center justify-between gap-2`}
          >
            <span>
              {catalogLoading
                ? "Loading enabled quotes…"
                : quote
                  ? `${quote.symbol} · ${quote.name}`
                  : "Choose a quote"}
            </span>
            <Search className="w-4 h-4 text-gray-400" />
          </button>
          {quoteOpen && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg p-2 space-y-2">
              <input
                autoFocus
                value={quoteQuery}
                onChange={(e) => setQuoteQuery(e.target.value)}
                placeholder={`Search ${shownQuotes.total} enabled quotes`}
                className={FIELD}
              />
              <ul className="max-h-64 overflow-auto">
                {shownQuotes.items.map((item) => (
                  <li key={item.mint}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => {
                        setQuote(item);
                        setQuoteOpen(false);
                        setQuoteQuery("");
                      }}
                    >
                      <span className="font-medium">{item.symbol}</span>
                      <span className="text-gray-500 dark:text-white/45 text-sm"> · {item.name}</span>
                      <span className="block text-[11px] font-mono text-gray-400 dark:text-white/30">{shortMint(item.mint)}</span>
                    </button>
                  </li>
                ))}
                {shownQuotes.items.length === 0 && (
                  <li className="px-3 py-4 text-sm text-gray-500">No enabled quote matches that.</li>
                )}
              </ul>
              {!quoteQuery && shownQuotes.total > shownQuotes.items.length && (
                <p className="px-2 text-[11px] text-gray-400 dark:text-white/35">
                  Showing SOL, USDC, and stocks first. Search to see all {shownQuotes.total} enabled quotes.
                </p>
              )}
            </div>
          )}
          {catalogError && <p className="text-sm text-red-500">{catalogError}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-white/50">Fee tier</label>
          <div className="grid grid-cols-3 gap-2">
            {(catalog?.tiers ?? []).map((item) => (
              <button
                key={item.index}
                type="button"
                disabled={busy}
                onClick={() => setTier(item.index)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  tier === item.index
                    ? "border-cyan-400 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                    : "border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {split && (
            <p className="text-[11px] text-gray-400 dark:text-white/35 leading-relaxed">
              Raydium keeps 0.25% on the curve. Of Float&apos;s fee: {bpsLabel(split.holdersBps)} holders,{" "}
              {bpsLabel(split.devBps)} creator, {bpsLabel(split.flagshipBps)} $FLOAT buyback,{" "}
              {bpsLabel(split.tradersBps)} trader rewards, {bpsLabel(split.treasuryBps)} treasury.
            </p>
          )}
        </div>

        <input className={FIELD} placeholder="Name" value={name} maxLength={32} disabled={busy} onChange={(e) => setName(e.target.value)} />
        <input
          className={`${FIELD} font-mono`}
          placeholder="Ticker (1–10 letters or digits)"
          value={ticker}
          maxLength={10}
          disabled={busy}
          onChange={(e) => setTicker(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
        />
        {ticker && tickerError(ticker) && <p className="text-xs text-red-500">{tickerError(ticker)}</p>}
        {preview && !tickerError(ticker) && (
          <p className={`text-xs ${preview.protected ? "text-red-500" : "text-gray-500 dark:text-white/45"}`}>
            {preview.protected
              ? `$${ticker.toUpperCase()} is protected for about ${preview.nextInSecs ?? 0}s and can't be taken over yet.`
              : preview.free
                ? `$${ticker.toUpperCase()} looks free. Cap stays 0, so the launch sends only while it stays free.`
                : `$${ticker.toUpperCase()} is taken. Taking it over costs ${lamportsToSolString(preview.lamports)} SOL right now.`}
          </p>
        )}
        {previewNote && <p className="text-xs text-gray-500 dark:text-white/45">{previewNote}</p>}

        <textarea
          className={`${FIELD} resize-none`}
          rows={2}
          placeholder="Description (optional)"
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition">
          {imagePreview ? (
            <span className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <span className="text-sm text-gray-500 dark:text-white/50">{imageFile?.name}</span>
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-white/30">Tap to upload or paste an image</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptImage(f);
            }}
          />
        </label>
        <input
          className={FIELD}
          placeholder="Or paste a metadata URI (https://…)"
          value={metadataUri}
          disabled={busy}
          onChange={(e) => setMetadataUri(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-white/50">Fee receiver</label>
          <input
            className={`${FIELD} font-mono text-sm`}
            placeholder="Defaults to your wallet"
            value={feeReceiver}
            disabled={busy}
            onChange={(e) => {
              feeTouched.current = true;
              setFeeReceiver(e.target.value);
            }}
          />
          <p className="text-[11px] text-gray-400 dark:text-white/35">Gets the creator share of this coin&apos;s fees.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-white/50">Ticker takeover cap (SOL)</label>
          <input
            className={`${FIELD} font-mono`}
            inputMode="decimal"
            value={cap}
            disabled={busy}
            onChange={(e) => {
              capTouched.current = true;
              setCap(e.target.value);
            }}
          />
          <p className="text-[11px] text-gray-400 dark:text-white/35">
            Most you&apos;ll pay if the ticker is already claimed. 0 launches only when it&apos;s free. A fresh claim costs more for the first hour (5 SOL, then 4, then 3), then the flat fee.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={vanity}
            disabled={busy}
            onChange={() => {
              setVanity((v) => !v);
              setVanityKp(null);
              setVanityTried(0);
            }}
          />
          <span className="text-sm">
            <span className="font-medium">Mint address ending in {VANITY_SUFFIX}</span>
            <span className="block text-xs text-gray-500 dark:text-white/40 mt-0.5">
              Uses Float&apos;s launch_keyed instruction and a mint key that signs. Searching for that suffix in the browser usually takes hours. Leave this off to launch now with a program-derived mint.
            </span>
            {vanity && (
              <span className="block text-xs mt-1 font-mono text-cyan-700 dark:text-cyan-300">
                {vanityKp
                  ? vanityKp.publicKey.toBase58()
                  : `Searching… ${vanityTried.toLocaleString()} tried`}
              </span>
            )}
          </span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 text-sm">{error}</div>
        )}

        {busy ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500 dark:text-white/50">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status === "auth" && "Approve Face ID…"}
            {status === "uploading" && "Uploading metadata…"}
            {status === "creating" && "Sending the Float launch…"}
            {status === "confirming" && "Confirming…"}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void launch()}
            disabled={
              Boolean(publicKey) &&
              (Boolean(catalog?.launchesPaused) || (vanity && !vanityKp) || Boolean(preview?.protected))
            }
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition disabled:cursor-not-allowed"
          >
            {!publicKey ? (
              <span className="inline-flex items-center gap-2"><KeyRound className="w-4 h-4" /> Connect wallet to launch</span>
            ) : (
              "Launch on Float"
            )}
          </button>
        )}
        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          About 0.04 SOL rent, plus the takeover cap if the ticker is taken. Your passkey wallet signs the Float launch.
        </p>
      </div>
    </main>
  );
}
