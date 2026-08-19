"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Gift, Check, ExternalLink, KeyRound } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { TokenIcon } from "@/components/token-meta";
import { useWallet } from "@/lib/wallet-context";
import { RPC, type Network } from "@/lib/network";
import {
  CLAIM_FEE_LAMPORTS,
  keypairFromSecret,
  parseGiftSecret,
  inspectGift,
  sweepGift,
} from "@/lib/gift-link";
import { analytics } from "@/lib/analytics";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  USDC_MAINNET,
  USDC_DEVNET,
  USDC_ICON,
  SOL_ICON,
  NATIVE_SOL_MINT,
  type WalletToken,
} from "@/lib/wallet-tokens";
import { txPath } from "@/lib/explorer";

type TokenMeta = {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  amount: bigint;
};

type GiftState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "empty"; wasClaimed: boolean }
  | {
      kind: "ready";
      gift: Keypair;
      lamports: number;
      usdcBase: number;
      tokens: TokenMeta[];
    };

function shortMint(m: string) {
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

async function loadTokenMeta(
  mint: string,
  decimals: number,
  amount: bigint,
): Promise<TokenMeta> {
  if (mint === USDC_MAINNET || mint === USDC_DEVNET) {
    return {
      mint,
      symbol: "USDC",
      name: "USD Coin",
      icon: USDC_ICON,
      decimals,
      amount,
    };
  }
  try {
    const r = await fetch(`/api/swap/search?q=${encodeURIComponent(mint)}`, {
      cache: "no-store",
    });
    if (r.ok) {
      const j = (await r.json()) as {
        tokens?: {
          id?: string;
          symbol?: string;
          name?: string;
          icon?: string;
          logoURI?: string;
        }[];
      };
      const hit = (j.tokens || []).find(
        (t) => t.id === mint || t.id?.toLowerCase() === mint.toLowerCase(),
      );
      if (hit) {
        return {
          mint,
          symbol: hit.symbol || shortMint(mint),
          name: hit.name || hit.symbol || shortMint(mint),
          icon: hit.icon || hit.logoURI,
          decimals,
          amount,
        };
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`/api/token/${encodeURIComponent(mint)}`, {
      cache: "no-store",
    });
    if (r.ok) {
      const j = (await r.json()) as {
        token?: {
          symbol?: string;
          name?: string;
          image_url?: string | null;
        };
      };
      if (j.token) {
        return {
          mint,
          symbol: j.token.symbol || shortMint(mint),
          name: j.token.name || j.token.symbol || shortMint(mint),
          icon: j.token.image_url || undefined,
          decimals,
          amount,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    mint,
    symbol: shortMint(mint),
    name: "Token",
    decimals,
    amount,
  };
}

function fireConfetti() {
  void import("canvas-confetti").then((mod) => {
    const confetti = mod.default;
    const end = Date.now() + 2200;
    const colors = ["#f59e0b", "#a855f7", "#22c55e", "#38bdf8", "#f472b6", "#ffffff"];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.55 },
      colors,
      startVelocity: 45,
    });
    frame();
  });
}

export default function ClaimPage() {
  const [state, setState] = useState<GiftState>({ kind: "loading" });
  const [network, setNetwork] = useState<Network>("mainnet");
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{
    lamports: number;
    usdcBase: number;
    tokens: TokenMeta[];
    signature: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    publicKey,
    walletLabel,
    connect,
    recover,
    loading: walletLoading,
    error: walletError,
    refreshBalance,
  } = useWallet();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const net: Network = params.get("n") === "d" ? "devnet" : "mainnet";
      setNetwork(net);
      setMessage(params.get("m"));

      const secret = parseGiftSecret(window.location.hash);
      const gift = secret ? keypairFromSecret(secret) : null;
      if (!gift) {
        if (!cancelled) setState({ kind: "invalid" });
        return;
      }

      try {
        const connection = new Connection(RPC[net], "confirmed");
        const { lamports, usdcBase, tokens } = await inspectGift(
          connection,
          gift.publicKey,
          net,
        );
        if (cancelled) return;
        if (lamports <= CLAIM_FEE_LAMPORTS && tokens.length === 0) {
          let wasClaimed = false;
          try {
            const r = await fetch(`/api/gift?pk=${gift.publicKey.toBase58()}`);
            const j = (await r.json()) as { found?: boolean; status?: string };
            wasClaimed =
              !!j.found && (j.status === "claimed" || j.status === "reclaimed");
          } catch {
            /* ignore */
          }
          if (!cancelled) setState({ kind: "empty", wasClaimed });
        } else {
          const enriched = await Promise.all(
            tokens.map((t) => loadTokenMeta(t.mint, t.decimals, t.amount)),
          );
          if (!cancelled) {
            setState({
              kind: "ready",
              gift,
              lamports,
              usdcBase,
              tokens: enriched,
            });
          }
        }
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    };
    void run();
    // Re-run if hash arrives late (some WebViews strip then restore)
    const onHash = () => {
      void run();
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const handleClaim = async () => {
    if (state.kind !== "ready" || !publicKey) return;
    setClaiming(true);
    setError(null);
    try {
      const connection = new Connection(RPC[network], "confirmed");

      let feePayer: PublicKey | undefined;
      try {
        const sRes = await fetch("/api/sponsor", { cache: "no-store" });
        const sData = (await sRes.json()) as {
          configured?: boolean;
          feePayer?: string;
        };
        if (sData.configured && sData.feePayer) {
          feePayer = new PublicKey(sData.feePayer);
        }
      } catch {
        /* fall back */
      }

      const result = await sweepGift(
        connection,
        state.gift,
        new PublicKey(publicKey),
        network,
        feePayer ? { feePayer } : undefined,
      );

      let signature = result.signature;
      if (result.sponsored) {
        const sp = await fetch("/api/sponsor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction: result.signature,
            network,
          }),
        });
        const sj = (await sp.json()) as {
          ok?: boolean;
          signature?: string;
          error?: string;
        };
        if (!sp.ok || !sj.signature) {
          const fallback = await sweepGift(
            connection,
            state.gift,
            new PublicKey(publicKey),
            network,
          );
          signature = fallback.signature;
        } else {
          signature = sj.signature;
        }
      }

      fetch("/api/gift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: state.gift.publicKey.toBase58(),
          claimedBy: publicKey,
        }),
      }).catch(() => {});

      const primaryAmt =
        result.usdcBase > 0
          ? result.usdcBase / 1e6
          : state.tokens.length
            ? Number(state.tokens[0].amount) / 10 ** state.tokens[0].decimals
            : result.lamports / LAMPORTS_PER_SOL;
      analytics.giftClaimed(primaryAmt);

      setClaimed({
        lamports: result.lamports,
        usdcBase: result.usdcBase,
        tokens: state.tokens,
        signature,
      });
      fireConfetti();
      await refreshBalance();
      const { toast } = await import("@/lib/toast");
      toast.money("Gift claimed!");
    } catch (err) {
      const { friendlyError } = await import("@/lib/friendly-errors");
      setError(friendlyError(err, "We couldn't claim this gift. Try again."));
    } finally {
      setClaiming(false);
    }
  };

  const isUsdc = state.kind === "ready" && state.usdcBase > 0 && state.tokens.length === 0;
  const giftSol =
    state.kind === "ready"
      ? Math.max(0, (state.lamports - CLAIM_FEE_LAMPORTS) / LAMPORTS_PER_SOL)
      : 0;
  const giftUsdc = state.kind === "ready" ? state.usdcBase / 1e6 : 0;
  const giftSpl = state.kind === "ready" ? state.tokens : [];

  const prettySol = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const prettyUsd = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const prettyTok = (amt: bigint | string, dec: number) => {
    const a = typeof amt === "bigint" ? amt : BigInt(amt);
    const s = a.toString().padStart(dec + 1, "0");
    const whole = s.slice(0, -dec) || "0";
    const frac = s.slice(-dec).replace(/0+$/, "");
    const wholeFmt = Number(whole).toLocaleString();
    return frac ? `${wholeFmt}.${frac.slice(0, 6)}` : wholeFmt;
  };

  const heroToken: WalletToken | null = useMemo(() => {
    if (giftSpl[0]) {
      const t = giftSpl[0];
      return {
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        icon: t.icon,
        decimals: t.decimals,
        uiAmount: Number(t.amount) / 10 ** t.decimals,
        amount: t.amount.toString(),
        programId: "",
      };
    }
    if (isUsdc) {
      return {
        mint: USDC_MAINNET,
        symbol: "USDC",
        name: "USD Coin",
        icon: USDC_ICON,
        decimals: 6,
        uiAmount: giftUsdc,
        amount: String(Math.round(giftUsdc * 1e6)),
        programId: "",
      };
    }
    if (state.kind === "ready" && giftSol > 0) {
      return {
        mint: NATIVE_SOL_MINT,
        symbol: "SOL",
        name: "Solana",
        icon: SOL_ICON,
        decimals: 9,
        uiAmount: giftSol,
        amount: String(Math.round(giftSol * 1e9)),
        programId: "",
        isNativeSol: true,
      };
    }
    return null;
  }, [giftSpl, isUsdc, giftUsdc, giftSol, state.kind]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 flex flex-col justify-center pb-24">
        <div className="mx-auto w-full max-w-md px-4 sm:px-6 py-5 sm:py-8 space-y-6">
          {state.kind === "loading" && (
            <div className="text-center space-y-3">
              <Spinner size={28} className="mx-auto" />
              <p className="text-gray-500 dark:text-white/50">Opening your gift…</p>
            </div>
          )}

          {state.kind === "invalid" && (
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Gift} size={40} className="text-gray-400 dark:text-white/30" />
              <h1 className="text-2xl font-bold">This link doesn&apos;t look right</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">
                Make sure you opened the complete link — gift links are long and easy to cut off.
              </p>
              <Link
                href="/gift"
                className="inline-block text-amber-500 hover:text-amber-400 text-sm font-medium"
              >
                Send a gift yourself →
              </Link>
            </div>
          )}

          {state.kind === "empty" && (
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Gift} size={40} className="text-gray-400 dark:text-white/30" />
              <h1 className="text-2xl font-bold">
                {state.wasClaimed ? "This gift was already claimed" : "This gift is empty"}
              </h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">
                {state.wasClaimed
                  ? "Someone with this link claimed it already."
                  : "There's nothing left in this gift — it may have been claimed or reclaimed."}
              </p>
              <Link
                href="/gift"
                className="inline-block text-amber-500 hover:text-amber-400 text-sm font-medium"
              >
                Send a gift yourself →
              </Link>
            </div>
          )}

          {state.kind === "ready" && !claimed && (
            <>
              <div className="text-center space-y-4">
                <div className="relative inline-flex">
                  <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-2xl scale-150" />
                  {heroToken ? (
                    <div className="relative ring-4 ring-amber-400/30 rounded-full p-1 bg-white dark:bg-black shadow-xl">
                      <TokenIcon token={heroToken} size={88} />
                    </div>
                  ) : (
                    <AnimatedIcon icon={Gift} size={56} className="text-amber-400 relative" />
                  )}
                  <span className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-black">
                    <Gift size={18} />
                  </span>
                </div>

                <p className="text-gray-500 dark:text-white/50 text-xs uppercase tracking-[0.2em] font-semibold">
                  Someone sent you
                </p>

                {giftSpl.length > 0 ? (
                  <div className="space-y-2">
                    {giftSpl.map((t) => (
                      <div key={t.mint} className="space-y-1">
                        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                          {prettyTok(t.amount, t.decimals)}{" "}
                          <span className="text-amber-500">{t.symbol}</span>
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-white/50">{t.name}</p>
                      </div>
                    ))}
                  </div>
                ) : isUsdc ? (
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    ${prettyUsd(giftUsdc)}{" "}
                    <span className="text-emerald-500 text-2xl sm:text-3xl">USDC</span>
                  </h1>
                ) : (
                  <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                    ◎ {prettySol(Math.max(giftSol, 0))}{" "}
                    <span className="text-violet-400 text-2xl sm:text-3xl">SOL</span>
                  </h1>
                )}

                {giftSol > 0.00001 && giftSpl.length > 0 && (
                  <p className="text-xs text-gray-400">
                    + ◎ {prettySol(giftSol)} SOL (rent/fees)
                  </p>
                )}
                {network === "devnet" && (
                  <p className="text-xs text-yellow-500 font-medium">devnet</p>
                )}
                {message && (
                  <p className="text-lg text-gray-700 dark:text-white/80 italic px-2">
                    &ldquo;{message}&rdquo;
                  </p>
                )}
              </div>

              {publicKey ? (
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
                  <p className="text-sm text-gray-500 dark:text-white/50 text-center">
                    Claiming to{" "}
                    <span className="text-gray-900 dark:text-white font-medium font-mono text-xs break-all">
                      {walletLabel || publicKey}
                    </span>
                  </p>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleClaim()}
                    disabled={claiming}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer flex items-center justify-center gap-2 min-h-[52px] text-base"
                  >
                    {claiming ? (
                      <>
                        <Spinner size={16} /> Claiming…
                      </>
                    ) : (
                      "Claim gift — free network fee"
                    )}
                  </button>
                  <p className="text-[11px] text-center text-gray-400">
                    sol.new pays the claim network fee
                  </p>
                </div>
              ) : (
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3 text-center">
                  <KeyRound className="w-7 h-7 text-amber-400 mx-auto" />
                  <h2 className="font-semibold">Create a wallet to claim</h2>
                  <p className="text-gray-500 dark:text-white/40 text-sm">
                    Face ID · name is your address · network fee covered by sol.new
                  </p>
                  {walletError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm text-left">
                      {walletError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void connect()}
                    disabled={walletLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer min-h-[52px]"
                  >
                    {walletLoading ? (
                      <>
                        <Spinner size={16} className="inline mr-2" />
                        Setting up…
                      </>
                    ) : (
                      "Create wallet & claim"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void recover({ forcePicker: true })}
                    disabled={walletLoading}
                    className="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
                  >
                    I already have a sol.new wallet
                  </button>
                </div>
              )}
            </>
          )}

          {claimed && (
            <div className="text-center space-y-4">
              <div className="relative inline-flex mx-auto">
                <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center ring-4 ring-green-500/20">
                  <Check className="w-10 h-10 text-green-500" />
                </div>
                {claimed.tokens[0] && (
                  <div className="absolute -right-2 -bottom-1 ring-2 ring-white dark:ring-black rounded-full">
                    <TokenIcon
                      token={{
                        icon: claimed.tokens[0].icon,
                        symbol: claimed.tokens[0].symbol,
                      }}
                      size={36}
                    />
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-bold">It&apos;s yours!</h1>
              {claimed.tokens.length > 0 ? (
                <div className="space-y-1">
                  {claimed.tokens.map((t) => (
                    <p key={t.mint} className="text-xl font-semibold">
                      {prettyTok(t.amount, t.decimals)}{" "}
                      <span className="text-amber-500">{t.symbol}</span>
                    </p>
                  ))}
                  <p className="text-gray-500 dark:text-white/50 text-sm">
                    {claimed.tokens.map((t) => t.name).join(", ")} is in your wallet.
                  </p>
                </div>
              ) : claimed.usdcBase > 0 ? (
                <p className="text-xl font-semibold">
                  ${prettyUsd(claimed.usdcBase / 1e6)} USDC is in your wallet.
                </p>
              ) : (
                <p className="text-xl font-semibold">
                  ◎ {prettySol(claimed.lamports / LAMPORTS_PER_SOL)} SOL is in your wallet.
                </p>
              )}
              <Link
                href={txPath(claimed.signature)}
                className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition"
              >
                View receipt <ExternalLink size={10} />
              </Link>
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/wallet"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-4 py-3.5 transition text-center"
                >
                  Open my wallet
                </Link>
                <Link
                  href="/gift"
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition text-center"
                >
                  Send someone a gift
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
