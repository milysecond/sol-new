"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Gift, Check, ExternalLink, KeyRound } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { RPC, type Network } from "@/lib/network";
import {
  CLAIM_FEE_LAMPORTS,
  keypairFromSecret,
  parseGiftSecret,
  inspectGift,
  sweepGift,
  type GiftTokenHolding,
  WSOL_MINT,
} from "@/lib/gift-link";
import { analytics } from "@/lib/analytics";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

type GiftState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "empty"; wasClaimed: boolean }
  | { kind: "ready"; gift: Keypair; lamports: number; usdcBase: number; tokens: GiftTokenHolding[] };

export default function ClaimPage() {
  const [state, setState] = useState<GiftState>({ kind: "loading" });
  const [network, setNetwork] = useState<Network>("mainnet");
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{
    lamports: number;
    usdcBase: number;
    signature: string;
    tokens: GiftTokenHolding[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  const { publicKey, walletLabel, connect, recover, loading: walletLoading, error: walletError, refreshBalance } = useWallet();

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const net: Network = params.get("n") === "d" ? "devnet" : "mainnet";
      setNetwork(net);
      setMessage(params.get("m"));

      const secret = parseGiftSecret(window.location.hash);
      const gift = secret ? keypairFromSecret(secret) : null;
      if (!gift) {
        setState({ kind: "invalid" });
        return;
      }

      try {
        const connection = new Connection(RPC[net], "confirmed");
        const { lamports, usdcBase, tokens } = await inspectGift(connection, gift.publicKey, net);
        if (lamports <= CLAIM_FEE_LAMPORTS && tokens.length === 0) {
          let wasClaimed = false;
          try {
            const r = await fetch(`/api/gift?pk=${gift.publicKey.toBase58()}`);
            const j = (await r.json()) as { found?: boolean; status?: string };
            wasClaimed = !!j.found && (j.status === "claimed" || j.status === "reclaimed");
          } catch {}
          setState({ kind: "empty", wasClaimed });
        } else {
          setState({ kind: "ready", gift, lamports, usdcBase, tokens });
        }
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, []);

  const handleClaim = async () => {
    if (state.kind !== "ready" || !publicKey) return;
    setClaiming(true);
    setError(null);
    try {
      const connection = new Connection(RPC[network], "confirmed");
      const { signature, lamports, usdcBase, tokens } = await sweepGift(
        connection,
        state.gift,
        new PublicKey(publicKey),
        network,
      );
      fetch("/api/gift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: state.gift.publicKey.toBase58(), claimedBy: publicKey }),
      }).catch(() => {});
      analytics.giftClaimed(usdcBase > 0 ? usdcBase / 1e6 : lamports / LAMPORTS_PER_SOL);
      setClaimed({ lamports, usdcBase, signature, tokens });
      await refreshBalance();
      const { toast } = await import("sonner");
      toast.success("Gift claimed!");
      try {
        new Audio("/chaching.mp3").play();
      } catch {}
    } catch (err) {
      const { friendlyError } = await import("@/lib/friendly-errors");
      setError(friendlyError(err, "We couldn't claim this gift. Try again."));
    } finally {
      setClaiming(false);
    }
  };

  const giftSol =
    state.kind === "ready" ? (state.lamports - CLAIM_FEE_LAMPORTS) / LAMPORTS_PER_SOL : 0;
  const giftUsdc = state.kind === "ready" ? state.usdcBase / 1e6 : 0;
  const giftTokens = state.kind === "ready" ? state.tokens : [];
  const prettySol = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const prettyUsd = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const headline =
    state.kind === "ready"
      ? giftUsdc > 0 && giftTokens.length <= 1 && giftSol <= 0
        ? `$${prettyUsd(giftUsdc)}`
        : giftTokens.length === 1 && giftSol <= 0
          ? `${Number(giftTokens[0].amount) / 10 ** giftTokens[0].decimals} ${
              giftTokens[0].mint === WSOL_MINT ? "WSOL" : "tokens"
            }`
          : giftTokens.length > 0
            ? "A crypto gift"
            : `◎ ${prettySol(Math.max(giftSol, 0))}`
      : "";

  const subline =
    state.kind === "ready"
      ? giftTokens.length > 1
        ? `${giftTokens.length} tokens` + (giftSol > 0 ? ` + ${prettySol(giftSol)} SOL` : "")
        : giftUsdc > 0
          ? "in USDC (digital dollars)"
          : giftTokens.length === 1
            ? giftTokens[0].mint === WSOL_MINT
              ? "wrapped SOL"
              : "SPL token"
            : `≈ ${prettySol(Math.max(giftSol, 0))} SOL`
      : "";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">

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
              <Link href="/gift" className="inline-block text-amber-500 hover:text-amber-400 text-sm font-medium">
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
              <Link href="/gift" className="inline-block text-amber-500 hover:text-amber-400 text-sm font-medium">
                Send a gift yourself →
              </Link>
            </div>
          )}

          {state.kind === "ready" && !claimed && (
            <>
              <div className="text-center space-y-3">
                <AnimatedIcon icon={Gift} size={48} className="text-amber-400" />
                <p className="text-gray-500 dark:text-white/50 text-sm uppercase tracking-widest">Someone sent you</p>
                <h1 className="text-5xl font-bold tracking-tight">
                  {headline}
                </h1>
                <p className="text-gray-500 dark:text-white/50">
                  {subline}
                  {network === "devnet" && " (devnet)"}
                </p>
                {message && (
                  <p className="text-lg text-gray-700 dark:text-white/80 italic">&ldquo;{message}&rdquo;</p>
                )}
              </div>

              {publicKey ? (
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
                  <p className="text-sm text-gray-500 dark:text-white/50 text-center">
                    Claiming to <span className="text-gray-900 dark:text-white font-medium">{walletLabel || `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`}</span>
                  </p>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleClaim}
                    disabled={claiming}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    {claiming ? <><Spinner size={16} /> Claiming…</> : "Claim my gift"}
                  </button>
                </div>
              ) : (
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3 text-center">
                  <KeyRound className="w-7 h-7 text-amber-400 mx-auto" />
                  <h2 className="font-semibold">Create a wallet to claim it</h2>
                  <p className="text-gray-500 dark:text-white/40 text-sm">
                    Takes seconds with Face ID or fingerprint. No app, no seed phrase.
                  </p>
                  <input
                    type="text"
                    placeholder="Name your wallet (e.g. Alex)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/25 transition text-sm"
                  />
                  {walletError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm text-left">
                      {walletError}
                    </div>
                  )}
                  <button
                    onClick={() => username.trim() && connect(username.trim())}
                    disabled={walletLoading || !username.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-black font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    {walletLoading ? <><Spinner size={16} className="inline mr-2" />Setting up…</> : "Create wallet & claim"}
                  </button>
                  <button
                    onClick={recover}
                    disabled={walletLoading}
                    className="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
                  >
                    I already have a sol.new wallet
                  </button>
                </div>
              )}
            </>
          )}

          {claimed && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-3xl font-bold">
                {claimed.tokens.length > 0 || claimed.usdcBase > 0
                  ? "Gift claimed!"
                  : `◎ ${prettySol(claimed.lamports / LAMPORTS_PER_SOL)} is yours!`}
              </h1>
              <p className="text-gray-500 dark:text-white/50">
                {claimed.tokens.length > 0
                  ? "Tokens are in your wallet."
                  : claimed.usdcBase > 0
                    ? "The USDC is in your wallet."
                    : "The SOL is in your wallet."}
              </p>
              <a
                href={`https://explorer.solana.com/tx/${claimed.signature}${network === "devnet" ? "?cluster=devnet" : ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 transition"
              >
                View transaction <ExternalLink size={10} />
              </a>
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/wallet"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-4 py-3.5 transition"
                >
                  Open my wallet
                </Link>
                <Link
                  href="/gift"
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition"
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
