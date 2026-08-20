"use client";
import { Coins, Rocket, Info, X, ArrowLeft, Users, Vote, Dog, Sparkles } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { PageTransition } from "@/components/page-transition";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { uploadImage, uploadMetadata } from "@/lib/api";
import { useImagePaste } from "@/lib/use-image-paste";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PromoInput } from "@/components/promo-input";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { analytics } from "@/lib/analytics";
import { friendlyError } from "@/lib/friendly-errors";

const DBC_PARTNER_CONFIG_MAINNET = new PublicKey("8G4yr6Q7wHvpRBGj1u9ZisY9Q95HNAxBQknaqUNanpvA");
const DBC_PARTNER_CONFIG_DEVNET = new PublicKey("QfakkckSG6L7hkuxiDQRWF7AW26MmrxBqgvMMmMzc3H");
const dbcPartnerConfig = (network: string) =>
  network === "devnet" ? DBC_PARTNER_CONFIG_DEVNET : DBC_PARTNER_CONFIG_MAINNET;

type Style = "pick" | "meteora" | "orynth" | "genesis" | "pump" | "bags" | "metadao" | "bonkfun";

// ─── Style picker ─────────────────────────────────────────────────────────────

type ExampleToken = {
  name: string;
  ticker: string;
  image: string;
  description: string;
  website?: string;
  twitter?: string;
  outcome: string;
};

const STYLE_OPTIONS: {
  key: Exclude<Style, "pick">;
  label: string;
  subtitle: string;
  detail: string;
  cost: string;
  icon: React.ReactNode;
  accent: string;
  disabled?: boolean;
  example?: ExampleToken;
}[] = [
  {
    key: "meteora",
    label: "Meteora",
    subtitle: "Custom bonding curve",
    detail: "Your own curve parameters, 1B supply, creator allocation, DAMM v2 graduation.",
    cost: "~0.045 SOL",
    icon: <Coins size={22} />,
    accent: "orange",
    example: {
      name: "Meteora",
      ticker: "MET",
      image: "/examples/met.jpg",
      description: "The token of Meteora — Solana's liquidity layer.",
      website: "meteora.ag",
      twitter: "@MeteoraAG",
      outcome: "Meteora's own token — made by the team behind this launch style.",
    },
  },
  {
    key: "orynth",
    label: "Orynth",
    subtitle: "Partner DBC launch",
    detail: "Launch via Orynth Partner API — Meteora DBC, sol.new earns partner fees, mints end in red.",
    cost: "~0.05 SOL",
    icon: <Sparkles size={22} />,
    accent: "purple",
    example: {
      name: "TOKENSHIT",
      ticker: "TOKENSHIT",
      image: "/icon-192.png",
      description: "Launched through sol.new × Orynth.",
      website: "sol.new",
      twitter: "@soldotnew",
      outcome: "Partner fee share on volume — claimable by sol.new.",
    },
  },
  {
    key: "pump",
    label: "Pump",
    subtitle: "pump.fun bonding curve",
    detail: "Launch on pump.fun's program. Free to create — just on-chain rent. Graduates to Raydium.",
    cost: "~0.008 SOL",
    icon: <Rocket size={22} />,
    accent: "purple",
    example: {
      name: "Fartcoin",
      ticker: "FARTCOIN",
      image: "/examples/fartcoin.png",
      description: "Hot Air Rises",
      website: "infinitebackrooms.com",
      twitter: "@FartCoinOfSOL",
      outcome: "Launched on pump.fun for pennies — peaked above a $2B market cap.",
    },
  },
  {
    key: "bags",
    label: "Bags",
    subtitle: "Creator social token",
    detail: "Your personal token tied to your identity. Followers can hold a piece of your brand.",
    cost: "~0.008 SOL",
    icon: <Users size={22} />,
    accent: "blue",
    example: {
      name: "Finnbags",
      ticker: "FINN",
      image: "/examples/finn.jpg",
      description: "Finn's personal creator token on Bags.",
      website: "bags.fm",
      twitter: "@finnbags",
      outcome: "The Bags founder's own creator coin — trading fees flow back to the creator.",
    },
  },
  {
    key: "bonkfun",
    label: "Bonk",
    subtitle: "bonk.fun bonding curve",
    detail: "Launch on LetsBonk's curve. Graduates to Raydium — fees fund BONK burns.",
    cost: "Coming soon",
    icon: <Dog size={22} />,
    accent: "amber",
    disabled: true,
    example: {
      name: "USELESS COIN",
      ticker: "USELESS",
      image: "/examples/useless.jpg",
      description: "It does absolutely nothing.",
      website: "theuselesscoin.com",
      twitter: "@theuselesscoin",
      outcome: "The most honest memecoin — rode bonk.fun to a $300M+ market cap.",
    },
  },
  {
    key: "genesis",
    label: "Genesis",
    subtitle: "Fair launch / TGE",
    detail: "Time-based deposit window. Price set by demand. Tokens claimed after the window closes.",
    cost: "~0.01 SOL",
    icon: <Coins size={22} />,
    accent: "orange",
    example: {
      name: "Portals",
      ticker: "PORTALS",
      image: "/examples/portals.png",
      description: "The browser-based metaverse on Solana.",
      website: "theportal.to",
      twitter: "@_portals_",
      outcome: "Raised via a Genesis fair TGE — every depositor got the same price, no insiders.",
    },
  },
  {
    key: "metadao",
    label: "Metadao",
    subtitle: "Futarchy governance",
    detail: "On-chain prediction markets decide proposals. Governance by market consensus.",
    cost: "~0.05 SOL",
    icon: <Vote size={22} />,
    accent: "green",
    example: {
      name: "Umbra",
      ticker: "UMBRA",
      image: "/examples/umbra.png",
      description: "Privacy infrastructure for Solana.",
      website: "umbraprivacy.com",
      twitter: "@UmbraPrivacy",
      outcome: "Raised via a MetaDAO futarchy ICO — markets, not VCs, set the terms.",
    },
  },
];

const ACCENT_CLASSES: Record<string, { border: string; bg: string; text: string; btn: string }> = {
  orange: {
    border: "border-orange-400/40",
    bg: "bg-orange-500/5",
    text: "text-orange-400",
    btn: "bg-orange-500 hover:bg-orange-400",
  },
  purple: {
    border: "border-purple-400/40",
    bg: "bg-purple-500/5",
    text: "text-purple-400",
    btn: "bg-purple-500 hover:bg-purple-400",
  },
  blue: {
    border: "border-blue-400/40",
    bg: "bg-blue-500/5",
    text: "text-blue-400",
    btn: "bg-blue-500 hover:bg-blue-400",
  },
  green: {
    border: "border-green-400/40",
    bg: "bg-green-500/5",
    text: "text-green-400",
    btn: "bg-green-500 hover:bg-green-400",
  },
  amber: {
    border: "border-amber-400/40",
    bg: "bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    btn: "bg-amber-500 hover:bg-amber-400",
  },
};

const EXAMPLE_TOKENS: {
  name: string;
  ticker: string;
  image: string;
  story: string;
}[] = [
  {
    name: "Bonk",
    ticker: "BONK",
    image: "/examples/bonk.jpg",
    story: "A dog coin airdropped to the Solana community — grew into a multi-billion dollar icon.",
  },
  {
    name: "dogwifhat",
    ticker: "WIF",
    image: "/examples/wif.jpg",
    story: "Literally a dog wearing a hat. Started tiny, peaked at a $4B+ market cap.",
  },
];

function TopTokensBrowse() {
  const { network } = useNetwork();
  const [tokens, setTokens] = useState<
    { name: string; symbol: string; mint_address: string; image_url: string | null; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    fetch(`/api/tokens/recent?limit=12&network=${network}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const ct = r.headers.get("content-type") || "";
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!ct.includes("application/json")) throw new Error("Bad response");
        return r.json() as Promise<{ tokens?: typeof tokens; error?: string }>;
      })
      .then((d) => {
        if (cancelled) return;
        setTokens(Array.isArray(d.tokens) ? d.tokens : []);
        if (d.error && !d.tokens?.length) setLoadError(d.error);
      })
      .catch((e) => {
        if (cancelled) return;
        setTokens([]);
        setLoadError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [network]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Top recent launches</p>
        <Link href="/whats-new" className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
          See all
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : loadError && tokens.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-xs text-gray-400">Couldn&apos;t load recent launches.</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              fetch(`/api/tokens/recent?limit=12&network=${network}`, { cache: "no-store" })
                .then((r) => r.json() as Promise<{ tokens?: typeof tokens }>)
                .then((d) => setTokens(d.tokens || []))
                .catch(() => setTokens([]))
                .finally(() => setLoading(false));
            }}
            className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No launches yet on this network.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tokens.map((t) => (
            <Link
              key={t.mint_address}
              href={`/token/${t.mint_address}`}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] hover:border-purple-400/40 transition"
            >
              {t.image_url ? (
                <img src={t.image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
                  <Coins size={14} className="text-orange-500" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate text-gray-900 dark:text-white">{t.name}</p>
                <p className="text-[10px] font-mono text-gray-400">${t.symbol}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ExampleTokens() {
  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-gray-400 dark:text-white/30">
        Famous tokens that started just like this
      </p>
      <div className="grid grid-cols-2 gap-3">
        {EXAMPLE_TOKENS.map((t) => (
          <div
            key={t.ticker}
            className="flex flex-col p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
          >
            <div className="flex items-center gap-2.5">
              <img
                src={t.image}
                alt={`${t.name} logo`}
                width={36}
                height={36}
                loading="lazy"
                className="w-9 h-9 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{t.name}</p>
                <p className="text-xs font-mono text-gray-500 dark:text-white/40">${t.ticker}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-2 leading-relaxed">{t.story}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExampleFormModal({
  option,
  onClose,
}: {
  option: (typeof STYLE_OPTIONS)[number];
  onClose: () => void;
}) {
  const ex = option.example!;
  const ac = ACCENT_CLASSES[option.accent];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field =
    "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`How ${ex.name} was launched`}
    >
      <div
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-black rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white/90 dark:bg-black/90 backdrop-blur border-b border-black/10 dark:border-white/10">
          <h2 className="text-lg font-bold flex items-center gap-2.5">
            <img src={ex.image} alt="" className="w-7 h-7 rounded-full object-cover" />
            How ${ex.ticker} was launched
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-3">
          <p className="text-sm text-gray-500 dark:text-white/50">
            A {option.label} launch — this is all the creator had to fill in.
          </p>

          <div>
            <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Token name</p>
            <div className={field}>{ex.name}</div>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Ticker</p>
            <div className={`${field} font-mono`}>{ex.ticker}</div>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Description</p>
            <div className={field}>{ex.description}</div>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Image</p>
            <div className="flex items-center gap-3 w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-3">
              <img src={ex.image} alt={`${ex.name} logo`} className="w-12 h-12 rounded-lg object-cover" />
              <span className="text-gray-500 dark:text-white/50 text-sm font-mono">
                {ex.ticker.toLowerCase()}.png
              </span>
            </div>
          </div>
          {(ex.website || ex.twitter) && (
            <div>
              <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Links</p>
              <div className="flex flex-wrap gap-2">
                {ex.website && <span className={`${field} !w-auto`}>{ex.website}</span>}
                {ex.twitter && <span className={`${field} !w-auto font-mono`}>{ex.twitter}</span>}
              </div>
            </div>
          )}

          <div className={`${ac.bg} border ${ac.border} rounded-xl px-4 py-3 text-sm ${ac.text}`}>
            {ex.outcome}
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-white/30">
            Recreated for illustration — not the original screenshot.
          </p>
        </div>
      </div>
    </div>
  );
}

function StylePicker({ onSelect }: { onSelect: (s: Exclude<Style, "pick">) => void }) {
  const [exampleFor, setExampleFor] = useState<(typeof STYLE_OPTIONS)[number] | null>(null);

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4">
        <div className="text-center space-y-1">
          <AnimatedIcon icon={Coins} size={32} className="text-purple-400" />
          <h1 className="text-2xl font-bold tracking-tight">Launch a token</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">Choose your launch style.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {STYLE_OPTIONS.map((opt) => {
            const ac = ACCENT_CLASSES[opt.accent];
            return (
              <div key={opt.key} className="relative">
                <button
                  onClick={() => onSelect(opt.key)}
                  disabled={opt.disabled}
                  className={`w-full h-full text-left p-4 rounded-2xl border transition group ${ac.border} ${ac.bg} ${opt.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-opacity-80"}`}
                >
                  <span className={`${ac.text} mb-2 block`}>{opt.icon}</span>
                  <p className="font-bold text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 leading-relaxed">{opt.subtitle}</p>
                  <p className={`text-xs font-mono mt-2 ${ac.text}`}>{opt.cost}</p>
                </button>
                {opt.example && (
                  <button
                    onClick={() => setExampleFor(opt)}
                    aria-label={`See how ${opt.example.name} was launched with ${opt.label}`}
                    title={`$${opt.example.ticker} launched this way`}
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full transition cursor-pointer hover:scale-110 focus-visible:ring-2 focus-visible:ring-purple-400 outline-none"
                  >
                    <img
                      src={opt.example.image}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/20"
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <TopTokensBrowse />
        <ExampleTokens />
      </div>

      {exampleFor && <ExampleFormModal option={exampleFor} onClose={() => setExampleFor(null)} />}
    </PageTransition>
  );
}

// ─── Pump / Bags form ─────────────────────────────────────────────────────────

function PumpForm({ style, onBack }: { style: "pump" | "bags"; onBack: () => void }) {
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
    analytics.launchInitiated(ticker, "pump-fun");
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

      const tx = Transaction.from(Buffer.from(data.tx, "base64"));
      tx.partialSign(userKeypair);

      const connection = new Connection(rpc, "confirmed");
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });

      setStatus("confirming");
      await connection.confirmTransaction(
        { signature: sig, blockhash: data.blockhash!, lastValidBlockHeight: data.lastValidBlockHeight! },
        "confirmed",
      );

      await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, name, symbol: ticker, description, imageUrl, metadataUri: metadata.uri, mintAddress: data.mint, network: "mainnet" }),
      }).catch(() => {});

      // For Bags: also set up creator profile
      if (style === "bags") {
        await fetch("/api/creator/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: publicKey }),
        }).catch(() => {});
      }

      await refreshBalance();
      analytics.tokenCreated(data.mint, ticker);
      router.push(`/launch/${data.mint}`);
    } catch (e: unknown) {
      analytics.launchFailed(ticker, String(e).slice(0, 120));
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status !== "idle" && status !== "error";
  const isBags = style === "bags";
  const accentColor = isBags ? "blue" : "purple";
  const ac = ACCENT_CLASSES[accentColor];

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4">
        <div className="text-center space-y-1 relative">
          <button onClick={onBack} className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm">
            <ArrowLeft size={15} />
          </button>
          <AnimatedIcon icon={isBags ? Users : Rocket} size={32} className={ac.text} />
          <h1 className="text-2xl font-bold tracking-tight">
            {isBags ? "Launch your token" : "Pump launch"}
          </h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">
            {isBags ? "Your personal creator token on pump.fun." : "Free creation on pump.fun's bonding curve."}
          </p>
        </div>

        <div className="space-y-3">
          <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition disabled:opacity-50" />
          <input type="text" placeholder="Ticker (e.g. PEPE)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={8} disabled={busy} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono disabled:opacity-50" />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={busy} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition resize-none disabled:opacity-50" />

          <label htmlFor="pump-image" className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden">
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
              </div>
            ) : (
              <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload or paste an image</span>
            )}
          </label>
          <input id="pump-image" ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptImage(f); }} className="sr-only" />

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "twitter", placeholder: "X / Twitter", value: twitter, set: setTwitter },
              { key: "telegram", placeholder: "Telegram", value: telegram, set: setTelegram },
              { key: "website", placeholder: "Website", value: website, set: setWebsite },
            ].map(({ key, placeholder, value, set }) => (
              <input key={key} type="text" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} disabled={busy} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-xs disabled:opacity-50" />
            ))}
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

          {busy ? (
            <div className="w-full space-y-3">
              <div className="relative h-12 overflow-hidden rounded-xl">
                <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{
                  left: status === "auth" ? "8%" : status === "uploading" ? "35%" : status === "creating" ? "65%" : "115%",
                  transition: "left 0.8s cubic-bezier(0.25, 0, 0.7, 0.4)",
                }}>
                  <Rocket className={`w-7 h-7 ${ac.text} rotate-45 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]`} />
                </div>
              </div>
              <p className="text-center text-sm text-gray-500 dark:text-white/50">
                {status === "auth" && "Signing in…"}
                {status === "uploading" && "Uploading image…"}
                {status === "creating" && "Building transaction…"}
                {status === "confirming" && "Almost there…"}
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={handleLaunch}
                disabled={!name || !ticker || !imageFile}
                className={`w-full ${ac.btn} disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed`}
              >
                {isBags ? "Launch my token" : "Launch on pump.fun"}
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-white/30">~0.008 SOL · rent only · graduates to Raydium</p>
            </>
          )}

          <div className="text-center text-xs text-gray-400 dark:text-white/30">
            Browse existing tokens at{" "}
            <Link href="/launch" className={`${ac.text} hover:underline`}>/launch</Link>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

// ─── Genesis form (existing DBC flow) ────────────────────────────────────────

function MeteorForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [supply] = useState("1000000000");
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
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [status, setStatus] = useState<"idle" | "auth" | "uploading" | "creating" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptImage(file);
  };
  useImagePaste(acceptImage);

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile) return;
    setError(null);
    analytics.launchInitiated(ticker, "meteora-dbc");
    try {
      setStatus("auth");
      const { address, keypair: userKeypair } = await getPasskeyKeypair();

      if (promoCode) {
        const fundRes = await fetch("/api/promo/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: "token_launch" }),
        });
        if (!fundRes.ok) {
          const err = await fundRes.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? "Promo funding failed — please try again.");
        }
      }

      if (!promoCode) {
        const connection0 = new Connection(rpc, "confirmed");
        const balance = await connection0.getBalance(new PublicKey(address));
        if (balance < 0.045 * 1e9) {
          const where = network === "devnet"
            ? "Claim devnet SOL from the Get page."
            : "Add funds from the Get page.";
          throw new Error(`You need at least 0.045 SOL to launch a token. Your balance is ${(balance / 1e9).toFixed(4)} SOL. ${where}`);
        }
      }

      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const imageUrl = uploaded.url;
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

      setStatus("creating");
      const connection = new Connection(rpc, "confirmed");
      const client = new DynamicBondingCurveClient(connection, "confirmed");

      // Mint keypair is generated client-side. Vanity (NEW…) keys are only
      // assigned server-side during launch build routes — never over public HTTP.
      const mintKeypair = Keypair.generate();
      const userPubkey = new PublicKey(address);

      const tx: Transaction = await client.pool.createPool({
        config: dbcPartnerConfig(network),
        baseMint: mintKeypair.publicKey,
        name,
        symbol: ticker,
        uri: metadata.uri,
        payer: userPubkey,
        poolCreator: userPubkey,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.feePayer = userPubkey;
      tx.recentBlockhash = blockhash;

      const FEE_VAULT = new PublicKey("Deqi6CBfo2FR2XVZXxSwmcjELy1JdbAXWDNFPzDAbtxW");
      if (!promoCode) {
        tx.add(SystemProgram.transfer({
          fromPubkey: userPubkey,
          toPubkey: FEE_VAULT,
          lamports: Math.round(0.005 * LAMPORTS_PER_SOL),
        }));
      }

      tx.partialSign(mintKeypair, userKeypair);

      const txId = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });

      setStatus("confirming");
      await connection.confirmTransaction({ signature: txId, blockhash, lastValidBlockHeight }, "confirmed");

      const mintAddress = mintKeypair.publicKey.toBase58();

      try {
        await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, name, symbol: ticker, supply, description, imageUrl, metadataUri: metadata.uri, mintAddress, network }),
        });
      } catch {
        // best-effort
      }

      await refreshBalance();

      if (promoCode) {
        fetch("/api/promo/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: "token_launch" }),
        }).catch(() => {});
      }

      analytics.tokenCreated(mintAddress, ticker);
      analytics.launchCompleted(mintAddress, ticker, "meteora-dbc");
      router.push(`/token/${mintAddress}`);
    } catch (e: unknown) {
      analytics.launchFailed(ticker, String(e).slice(0, 120));
      setError(friendlyError(e, "We couldn't launch your token. Please try again."));
      setStatus("error");
    }
  };

  const busy = status === "auth" || status === "uploading" || status === "creating" || status === "confirming";

  return (
    <>
      <PageTransition>
        <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4">
          <div className="text-center space-y-1 relative">
            <button onClick={onBack} className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm">
              <ArrowLeft size={15} />
            </button>
            <AnimatedIcon icon={Coins} size={32} className="text-orange-400" />
            <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
              Meteora launch
              <button type="button" onClick={() => setShowInfo(true)} aria-label="What is this?" className="text-gray-400 dark:text-white/30 hover:text-orange-400 transition cursor-pointer">
                <Info className="w-4 h-4" />
              </button>
            </h1>
            <p className="text-gray-500 dark:text-white/50 text-sm">Custom bonding curve on Meteora DAMM v2. Graduates at ~69 SOL.</p>
          </div>

          <div className="space-y-3">
            <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition" />
            <input type="text" placeholder="Ticker (e.g. SOL)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={8} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition font-mono" />
            <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition resize-none" />

            <label htmlFor="token-image-upload" className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden">
              {imagePreview ? (
                <div className="flex items-center gap-3">
                  <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                  <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
                </div>
              ) : (
                <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload or paste an image</span>
              )}
            </label>
            <input id="token-image-upload" ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} className="sr-only" />

            {/* Social links */}
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
                  <button key={key} type="button" onClick={() => {
                    const next = new Set(activeSocials);
                    if (next.has(key)) { next.delete(key); } else { next.add(key); }
                    setActiveSocials(next);
                  }} className={`p-2 rounded-lg border transition cursor-pointer ${activeSocials.has(key) ? "bg-orange-500/20 border-orange-400/50 text-orange-400" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60"}`} title={label}>{icon}</button>
                ))}
              </div>
              {activeSocials.has("website") && <input type="url" placeholder="Website URL" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("twitter") && <input type="text" placeholder="X handle" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("telegram") && <input type="text" placeholder="Telegram link" value={telegram} onChange={(e) => setTelegram(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("instagram") && <input type="text" placeholder="Instagram handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("github") && <input type="text" placeholder="GitHub URL" value={github} onChange={(e) => setGithub(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("youtube") && <input type="text" placeholder="YouTube URL" value={youtube} onChange={(e) => setYoutube(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
              {activeSocials.has("tiktok") && <input type="text" placeholder="TikTok handle" value={tiktok} onChange={(e) => setTiktok(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition text-sm" />}
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

            {busy ? (
              <div className="w-full space-y-3">
                <div className="relative h-12 overflow-hidden rounded-xl">
                  <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{
                    left: status === "auth" ? "8%" : status === "uploading" ? "35%" : status === "creating" ? "65%" : "115%",
                    transition: status === "confirming" ? "left 0.5s cubic-bezier(0.55, 0, 1, 0.45)" : status === "creating" ? "left 0.7s cubic-bezier(0.4, 0, 0.9, 0.4)" : "left 0.9s cubic-bezier(0.25, 0, 0.7, 0.4)",
                  }}>
                    <div className="flex items-center gap-0.5 mr-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="rounded-full animate-pulse" style={{ width: `${3 + i}px`, height: `${3 + i}px`, background: i > 2 ? "#f59e0b" : i > 0 ? "#9333ea" : "#6b21a8", opacity: 0.3 + i * 0.15, animationDelay: `${i * 0.08}s`, boxShadow: i > 2 ? "0 0 6px #f59e0b" : "0 0 4px #9333ea" }} />
                      ))}
                    </div>
                    {[...Array(8)].map((_, i) => (
                      <div key={`spark-${i}`} className="absolute rounded-full sol-spark" style={{ width: "3px", height: "3px", background: i % 3 === 0 ? "#14f195" : i % 3 === 1 ? "#9945ff" : "#f59e0b", top: `${(i % 2 === 0 ? -1 : 1) * (6 + i * 3)}px`, left: `${-8 - i * 6}px`, animationDelay: `${i * 0.1}s`, boxShadow: `0 0 4px ${i % 3 === 0 ? "#14f195" : i % 3 === 1 ? "#9945ff" : "#f59e0b"}` }} />
                    ))}
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
              <>
                <PromoInput onValidCode={setPromoCode} onClear={() => setPromoCode(null)} />
                <button onClick={handleLaunch} disabled={!name || !ticker || !imageFile} className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed">
                  Launch token
                </button>
              </>
            )}
            <p className="text-center text-xs text-gray-400 dark:text-white/30">
              {promoCode ? <span className="text-green-400">Free with promo code</span> : "~0.045 SOL"}
            </p>
          </div>
        </div>
      </PageTransition>

      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={() => setShowInfo(false)}>
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-black rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white/90 dark:bg-black/90 backdrop-blur border-b border-black/10 dark:border-white/10">
              <h2 className="text-lg font-bold flex items-center gap-2"><Info className="w-5 h-5 text-orange-400" /> How a token launch works</h2>
              <button type="button" onClick={() => setShowInfo(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-5 space-y-5 text-sm text-gray-700 dark:text-white/70">
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">What you&apos;re creating</h3><p>A Solana token (1 billion supply, fixed). Anyone can buy or sell it from minute one — no listing process, no waiting.</p></div>
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">How people buy and sell it</h3><p>Your token starts in a <b>bonding curve</b> — price goes up automatically as people buy, and down when they sell.</p></div>
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">What it costs you</h3><ul className="space-y-1.5 list-disc pl-5"><li><b>~0.045 SOL</b> from your wallet — on-chain rent (~0.04 SOL) + 0.005 SOL platform fee (waived with a promo code).</li><li>Buyers pay a <b>1% trading fee</b> on every swap.</li></ul></div>
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">Your creator allocation</h3><p>You get <b>69 million tokens (6.9%)</b> unlocking linearly over 69 days.</p></div>
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">Graduation</h3><p>When the curve collects about <b>69 SOL</b>, liquidity moves to DAMM v2 automatically.</p></div>
              <div><h3 className="font-semibold text-gray-900 dark:text-white mb-1">Live vs Test mode</h3><p>The pill in the header switches between <b className="text-green-500">live</b> (mainnet) and <b className="text-yellow-500">test</b> (devnet — free SOL to practice).</p></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Genesis form (Metaplex Genesis SDK — TGE / fair launch) ─────────────────

const DEPOSIT_DURATIONS = [
  { label: "24 hours", seconds: 86400 },
  { label: "48 hours", seconds: 172800 },
  { label: "7 days", seconds: 604800 },
];

function GenesisForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [durationIdx, setDurationIdx] = useState(0);
  const [status, setStatus] = useState<"idle" | "auth" | "uploading" | "creating" | "done" | "error">("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { rpc } = useNetwork();

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  useImagePaste(acceptImage);

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile) return;
    setError(null);
    try {
      setStatus("auth");
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair: userKeypair } = await getPasskeyKeypair();

      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const metadata = await uploadMetadata({ name, symbol: ticker, description, image: uploaded.url });

      setStatus("creating");
      const { createUmiWithKeypair } = await import("@/lib/umi-passkey");
      const {
        initializeV2,
        addUnlockedBucketV2,
        addLaunchPoolBucketV2,
        finalizeV2,
        findGenesisAccountV2Pda,
        findUnlockedBucketV2Pda,
      } = await import("@metaplex-foundation/genesis");
      const { generateSigner, publicKey, createSignerFromKeypair } = await import("@metaplex-foundation/umi");

      const umi = await createUmiWithKeypair(rpc, userKeypair);

      // Random mint signer client-side. Server launch routes may still attach
      // vanity ground keys without exposing secrets to browsers.
      const baseMint = generateSigner(umi);
      const TOTAL_SUPPLY = BigInt(1_000_000_000) * BigInt(1_000_000_000); // 1B tokens, 9 decimals
      const WSOL = publicKey("So11111111111111111111111111111111111111112");

      // Step 1: Initialize
      setStep(1);
      await initializeV2(umi, {
        baseMint,
        quoteMint: WSOL,
        fundingMode: 0,
        totalSupplyBaseToken: TOTAL_SUPPLY,
        name,
        symbol: ticker,
        uri: metadata.uri,
      }).sendAndConfirm(umi);

      const [genesisAccountPda] = findGenesisAccountV2Pda(umi, { baseMint: baseMint.publicKey, genesisIndex: 0 });
      const [unlockedBucketPda] = findUnlockedBucketV2Pda(umi, { genesisAccount: genesisAccountPda, bucketIndex: 0 });

      const nowSecs = BigInt(Math.floor(Date.now() / 1000));
      const durationSecs = BigInt(DEPOSIT_DURATIONS[durationIdx].seconds);
      const depositStart = nowSecs;
      const depositEnd = nowSecs + durationSecs;
      const claimStart = depositEnd + BigInt(60);
      const claimEnd = claimStart + BigInt(2592000); // 30 day claim window

      const timeCondition = (t: bigint) => ({
        __kind: "TimeAbsolute" as const,
        padding: Array(47).fill(0),
        time: t,
        triggeredTimestamp: null,
      });

      // Step 2: Add unlocked bucket (treasury — receives the SOL)
      setStep(2);
      await addUnlockedBucketV2(umi, {
        genesisAccount: genesisAccountPda,
        baseMint: baseMint.publicKey,
        baseTokenAllocation: BigInt(0),
        recipient: umi.identity.publicKey,
        claimStartCondition: timeCondition(claimStart),
        claimEndCondition: timeCondition(claimEnd),
        backendSigner: null,
      }).sendAndConfirm(umi);

      // Step 3: Add launch pool bucket
      setStep(3);
      await addLaunchPoolBucketV2(umi, {
        genesisAccount: genesisAccountPda,
        baseMint: baseMint.publicKey,
        baseTokenAllocation: TOTAL_SUPPLY,
        depositStartCondition: timeCondition(depositStart),
        depositEndCondition: timeCondition(depositEnd),
        claimStartCondition: timeCondition(claimStart),
        claimEndCondition: timeCondition(claimEnd),
        softCap: null,
        minimumDepositAmount: null,
        endBehaviors: [{
          __kind: "SendQuoteTokenPercentage" as const,
          padding: Array(4).fill(0),
          destinationBucket: unlockedBucketPda,
          percentageBps: 10000,
          processed: false,
        }],
      }).sendAndConfirm(umi);

      // Step 4: Finalize
      setStep(4);
      await finalizeV2(umi, {
        baseMint: baseMint.publicKey,
        genesisAccount: genesisAccountPda,
      }).sendAndConfirm(umi);

      const mintAddress = baseMint.publicKey.toString();
      try {
        await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, symbol: ticker, description, imageUrl: uploaded.url, metadataUri: metadata.uri, mintAddress, network: "mainnet" }),
        });
      } catch { /* best-effort */ }

      setStatus("done");
      router.push(`/genesis/${mintAddress}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status === "auth" || status === "uploading" || status === "creating";
  const STEP_LABELS = ["", "Initializing token…", "Setting up treasury…", "Creating launch pool…", "Finalizing…"];

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4">
        <div className="text-center space-y-1 relative">
          <button onClick={onBack} className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm">
            <ArrowLeft size={15} />
          </button>
          <AnimatedIcon icon={Coins} size={32} className="text-orange-400" />
          <h1 className="text-2xl font-bold tracking-tight">Genesis launch</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">Fair TGE — price set by demand, tokens claimed after the window.</p>
        </div>

        <div className="space-y-3">
          <input type="text" placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 transition" />
          <input type="text" placeholder="Ticker (e.g. GEN)" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={8} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 transition font-mono" />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 transition resize-none" />

          <label htmlFor="genesis-image" className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden">
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
              </div>
            ) : (
              <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload or paste an image</span>
            )}
          </label>
          <input id="genesis-image" ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptImage(f); }} className="sr-only" />

          {/* Deposit window */}
          <div>
            <p className="text-xs text-gray-500 dark:text-white/40 mb-2">Deposit window</p>
            <div className="grid grid-cols-3 gap-2">
              {DEPOSIT_DURATIONS.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => setDurationIdx(i)}
                  className={`py-2 rounded-xl text-sm border transition cursor-pointer ${durationIdx === i ? "border-orange-400/50 bg-orange-500/10 text-orange-400" : "border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:border-black/20 dark:hover:border-white/20"}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-orange-500/5 border border-orange-400/20 rounded-xl px-4 py-3 text-xs text-orange-400/80 space-y-1">
            <p>1,000,000,000 tokens total supply. Price = total SOL deposited ÷ supply.</p>
            <p>Claim window opens 1 minute after deposit closes. Raised SOL goes to your wallet.</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {busy && step > 0 && (
          <p className="text-sm text-orange-400 text-center animate-pulse">
            Step {step}/4 — {STEP_LABELS[step]}
          </p>
        )}

        <button
          onClick={handleLaunch}
          disabled={busy || !name || !ticker || !imageFile}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? (status === "auth" ? "Authenticating…" : status === "uploading" ? "Uploading…" : "Creating…") : "Launch Genesis TGE"}
        </button>
      </div>
    </PageTransition>
  );
}

// ─── MetaDAO form (futarchy DAO creation) ────────────────────────────────────

const DAO_DURATIONS = [
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
];

function MetadaoForm({ onBack }: { onBack: () => void }) {
  const [mintAddress, setMintAddress] = useState("");
  const [initialPrice, setInitialPrice] = useState("0.10");
  const [durationIdx, setDurationIdx] = useState(0);
  const [status, setStatus] = useState<"idle" | "auth" | "creating" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const { rpc } = useNetwork();
  const router = useRouter();

  const handleCreate = async () => {
    const price = parseFloat(initialPrice);
    if (!mintAddress || isNaN(price) || price <= 0) return;
    setError(null);
    try {
      setStatus("auth");
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair: userKeypair } = await getPasskeyKeypair();

      setStatus("creating");
      const { Connection, Transaction } = await import("@solana/web3.js");
      const connection = new Connection(rpc, "confirmed");

      const res = await fetch("/api/govern/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress,
          initialPriceUsdc: price,
          secondsPerProposal: DAO_DURATIONS[durationIdx].seconds,
          creatorWallet: userKeypair.publicKey.toBase58(),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; tx: string; dao: string; lastValidBlockHeight: number };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to build transaction");

      const txBytes = Buffer.from(data.tx, "base64");
      const tx = Transaction.from(txBytes);
      tx.sign(userKeypair);

      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(
        { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: data.lastValidBlockHeight },
        "confirmed",
      );

      setStatus("done");
      router.push(`/govern/${data.dao}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status === "auth" || status === "creating";
  const valid = mintAddress.length >= 32 && parseFloat(initialPrice) > 0;

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4">
        <div className="text-center space-y-1 relative">
          <button onClick={onBack} className="absolute left-0 top-0 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer flex items-center gap-1 text-sm">
            <ArrowLeft size={15} />
          </button>
          <AnimatedIcon icon={Vote} size={32} className="text-green-400" />
          <h1 className="text-2xl font-bold tracking-tight">Futarchy DAO</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">Create a MetaDAO — governance by prediction markets.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-white/40 block mb-1.5">Your token&apos;s mint address</label>
            <input
              type="text"
              placeholder="Paste mint address (e.g. So11…)"
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value.trim())}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-green-400/50 transition font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-white/40 block mb-1.5">Initial token price (USDC)</label>
            <input
              type="number"
              placeholder="0.10"
              value={initialPrice}
              min="0.000001"
              step="0.01"
              onChange={(e) => setInitialPrice(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-green-400/50 transition"
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-white/40 mb-2">Proposal duration</p>
            <div className="grid grid-cols-3 gap-2">
              {DAO_DURATIONS.map((d, i) => (
                <button
                  key={d.label}
                  onClick={() => setDurationIdx(i)}
                  className={`py-2 rounded-xl text-sm border transition cursor-pointer ${durationIdx === i ? "border-green-400/50 bg-green-500/10 text-green-400" : "border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:border-black/20 dark:hover:border-white/20"}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-green-500/5 border border-green-400/20 rounded-xl px-4 py-3 text-xs text-green-400/80 space-y-1">
            <p>Proposals pass when the &quot;pass&quot; prediction market price exceeds &quot;fail&quot; by 50%+.</p>
            <p>Min 10 USDC + 1,000 tokens needed in AMMs before proposals can be created.</p>
            <p>Requires ~0.05 SOL for on-chain rent.</p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm break-all">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={busy || !valid}
          className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? (status === "auth" ? "Authenticating…" : "Creating DAO…") : "Create Futarchy DAO"}
        </button>
      </div>
    </PageTransition>
  );
}


// ─── Orynth Partner DBC launch ────────────────────────────────────────────────

function OrynthForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("https://sol.new");
  const [status, setStatus] = useState<
    "idle" | "auth" | "uploading" | "creating" | "signing" | "confirming" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [quoteSol, setQuoteSol] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { publicKey, refreshBalance, balance } = useWallet();
  const { rpc } = useNetwork();

  const acceptImage = useCallback((file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);
  useImagePaste(acceptImage);

  useEffect(() => {
    fetch("/api/orynth/quote", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ launchCost?: { requiredSol?: number } }>)
      .then((j) => {
        if (j.launchCost?.requiredSol != null) setQuoteSol(j.launchCost.requiredSol);
      })
      .catch(() => {});
  }, []);

  const handleLaunch = async () => {
    if (!name || !ticker || !imageFile || !publicKey) return;
    setError(null);
    analytics.launchInitiated(ticker, "orynth");
    try {
      setStatus("auth");
      const { keypair: userKeypair } = await getPasskeyKeypair();

      const need = quoteSol ?? 0.05;
      if ((balance ?? 0) < need - 0.001) {
        throw new Error(
          `Need ~${need.toFixed(3)} SOL to launch (balance ${(balance ?? 0).toFixed(4)}). Open Get funds.`,
        );
      }

      setStatus("uploading");
      const uploaded = await uploadImage(imageFile);
      const imageUrl = uploaded.url;

      setStatus("creating");
      const prepRes = await fetch("/api/orynth/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerWalletAddress: publicKey,
          name,
          symbol: ticker,
          description: description || `${name} launched on sol.new`,
          imageUrl,
          websiteUrl: website || "https://sol.new",
          twitter: twitter || undefined,
          telegram: telegram || undefined,
          creatorUsername: publicKey.slice(0, 8),
        }),
      });
      const prep = (await prepRes.json()) as {
        ok?: boolean;
        error?: string;
        launchId?: string;
        preparedTxHex?: string;
        mintAddress?: string | null;
      };
      if (!prepRes.ok || !prep.launchId || !prep.preparedTxHex) {
        throw new Error(prep.error || "Orynth prepare failed");
      }

      setStatus("signing");
      const tx = Transaction.from(Buffer.from(prep.preparedTxHex, "hex"));
      // poolCreator already signed server-side; payer signs here
      tx.partialSign(userKeypair);
      const signedTxHex = Buffer.from(tx.serialize()).toString("hex");

      const subRes = await fetch("/api/orynth/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launchId: prep.launchId, signedTxHex }),
      });
      const sub = (await subRes.json()) as {
        ok?: boolean;
        error?: string;
        launch?: {
          mintAddress?: string;
          launchSignature?: string;
          status?: string;
          poolAddress?: string;
        };
        mintAddress?: string;
      };
      if (!subRes.ok) throw new Error(sub.error || "Orynth submit failed");

      setStatus("confirming");
      // poll status up to ~45s
      let mint =
        sub.launch?.mintAddress ||
        sub.mintAddress ||
        prep.mintAddress ||
        null;
      let sig = sub.launch?.launchSignature || null;
      for (let i = 0; i < 15 && (!mint || !sig); i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await fetch(
          `/api/orynth/status?launchId=${encodeURIComponent(prep.launchId)}`,
        ).then((r) => r.json() as Promise<{
          launch?: { mintAddress?: string; launchSignature?: string; status?: string };
          mintAddress?: string;
          launchSignature?: string;
          status?: string;
        }>);
        const L = st.launch || st;
        mint = (L as { mintAddress?: string }).mintAddress || mint;
        sig = (L as { launchSignature?: string }).launchSignature || sig;
        if ((L as { status?: string }).status === "launched" && mint) break;
        if ((L as { status?: string }).status === "failed") {
          throw new Error("Orynth reported launch failed");
        }
      }

      if (mint) {
        await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: publicKey,
            name,
            symbol: ticker,
            description,
            imageUrl,
            mintAddress: mint,
            network: "mainnet",
            platform: "orynth",
          }),
        }).catch(() => {});
      }

      await refreshBalance();
      if (mint) {
        analytics.tokenCreated(mint, ticker);
        analytics.launchCompleted(mint, ticker, "orynth");
        router.push(`/token/${mint}`);
      } else {
        analytics.launchCompleted(prep.launchId, ticker, "orynth");
        setStatus("done");
        setError(null);
        // stay with success message
        throw new Error(
          "Launch submitted — mint not ready yet. Check status shortly.",
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("mint not ready")) {
        setStatus("done");
        setError(msg);
        return;
      }
      analytics.launchFailed(ticker, msg.slice(0, 120));
      setError(friendlyError(e, "Couldn't launch via Orynth."));
      setStatus("error");
    }
  };

  const busy = status !== "idle" && status !== "error" && status !== "done";
  const ac = ACCENT_CLASSES.purple;

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6 py-5 sm:py-8 space-y-4 mx-auto">
        <div className="text-center space-y-1 relative">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 top-0 text-gray-400 hover:text-gray-600 transition flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={15} />
          </button>
          <AnimatedIcon icon={Sparkles} size={32} className={ac.text} />
          <h1 className="text-2xl font-bold tracking-tight">Orynth launch</h1>
          <p className="text-gray-500 dark:text-white/50 text-sm">
            Partner DBC on Meteora · you pay ~{quoteSol?.toFixed(3) ?? "0.05"} SOL · fees to sol.new
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Token name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 disabled:opacity-50"
          />
          <input
            type="text"
            placeholder="Ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={12}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 font-mono disabled:opacity-50"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={busy}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 resize-none disabled:opacity-50"
          />

          <label
            htmlFor="orynth-image"
            className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer"
          >
            {imagePreview ? (
              <div className="flex items-center gap-3">
                <img src={imagePreview} alt="" className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-sm text-gray-500">{imageFile?.name}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Tap to upload or paste an image</span>
            )}
          </label>
          <input
            id="orynth-image"
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptImage(f);
            }}
            className="sr-only"
          />

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="X / Twitter"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              disabled={busy}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="Telegram"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              disabled={busy}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="Website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={busy}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {status === "done" && !error?.includes("Couldn't") && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-600 text-sm">
              Launch submitted. Mint may appear shortly on your portfolio.
            </div>
          )}

          {busy ? (
            <p className="text-center text-sm text-gray-500">
              {status === "auth" && "Face ID…"}
              {status === "uploading" && "Uploading image…"}
              {status === "creating" && "Orynth preparing…"}
              {status === "signing" && "Signing & submitting…"}
              {status === "confirming" && "Confirming on-chain…"}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleLaunch()}
                disabled={!name || !ticker || !imageFile || !publicKey}
                className={`w-full ${ac.btn} disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3.5`}
              >
                Launch with Orynth
              </button>
              <p className="text-center text-xs text-gray-400">
                ~{quoteSol?.toFixed(3) ?? "0.05"} SOL · mint ends in{" "}
                <span className="font-mono text-purple-400">red</span> · partner fees to sol.new
              </p>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TokenPage() {
  const [style, setStyle] = useState<Style>("pick");

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full pb-24">
        <div className="app-shell py-5 sm:py-8 lg:py-10">
          {style === "pick" && <StylePicker onSelect={setStyle} />}
          {style === "meteora" && <MeteorForm onBack={() => setStyle("pick")} />}
          {style === "orynth" && <OrynthForm onBack={() => setStyle("pick")} />}
          {(style === "pump" || style === "bags") && <PumpForm style={style} onBack={() => setStyle("pick")} />}
          {style === "genesis" && <GenesisForm onBack={() => setStyle("pick")} />}
          {style === "metadao" && <MetadaoForm onBack={() => setStyle("pick")} />}
        </div>
      </main>
    </div>
  );
}
