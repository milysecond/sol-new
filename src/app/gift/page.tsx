"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Gift, Check, Share2, Undo2, ExternalLink, X } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { SlideToSend } from "@/components/slide-to-send";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useDefaultToken } from "@/lib/currency-pref";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import {
  CLAIM_FEE_LAMPORTS,
  USDC_GIFT_FUND_LAMPORTS,
  keypairFromSecret,
  parseGiftSecret,
  sweepGift,
  loadGiftLinks,
  saveGiftLink,
  removeGiftLink,
  type GiftLinkEntry,
  type GiftToken,
} from "@/lib/gift-link";
import { analytics } from "@/lib/analytics";
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import QRCode from "qrcode";

type Status = "idle" | "auth" | "sending" | "confirming" | "done" | "error";

const TOKENS: GiftToken[] = ["SOL", "USDC"];
const PRESETS: Record<GiftToken, string[]> = {
  SOL: ["0.05", "0.1", "0.5", "1"],
  USDC: ["5", "10", "20", "50"],
};
// Sender-side SOL needed for a USDC gift: gift wallet float + gift token
// account rent + own tx fee.
const USDC_GIFT_SENDER_LAMPORTS = USDC_GIFT_FUND_LAMPORTS + 2_100_000;

/** Seconds after create during which cancel is prominently offered. */
const CANCEL_WINDOW_SEC = 30;

export default function GiftPage() {
  const [defaultToken] = useDefaultToken();
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<GiftToken>("SOL");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [giftEntry, setGiftEntry] = useState<GiftLinkEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<GiftLinkEntry[]>([]);
  const [linkStatuses, setLinkStatuses] = useState<Record<string, string>>({});
  const [reclaiming, setReclaiming] = useState<string | null>(null);
  const [cancelLeft, setCancelLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { publicKey, walletLabel, balance, usdcBalance, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();

  useEffect(() => {
    setToken(defaultToken as GiftToken);
  }, [defaultToken]);

  const refreshLinks = useCallback(() => setLinks(loadGiftLinks()), []);
  useEffect(() => {
    refreshLinks();
  }, [refreshLinks]);

  // Fetch claim status for listed links
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        links.map(async (l) => {
          try {
            const r = await fetch(`/api/gift?pk=${l.pubkey}`);
            const j = (await r.json()) as { found?: boolean; status?: string };
            return [l.pubkey, j.found && j.status ? j.status : "pending"] as const;
          } catch {
            return [l.pubkey, "pending"] as const;
          }
        })
      );
      if (!cancelled) setLinkStatuses(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [links]);

  useEffect(() => {
    if (!giftUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, giftUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [giftUrl]);

  useEffect(() => {
    return () => {
      if (cancelTimer.current) clearInterval(cancelTimer.current);
    };
  }, []);

  const startCancelWindow = () => {
    if (cancelTimer.current) clearInterval(cancelTimer.current);
    setCancelLeft(CANCEL_WINDOW_SEC);
    cancelTimer.current = setInterval(() => {
      setCancelLeft((s) => {
        if (s <= 1) {
          if (cancelTimer.current) clearInterval(cancelTimer.current);
          cancelTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleCreate = async () => {
    if (!publicKey) return;
    setError(null);

    try {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) throw new Error("Enter an amount");

      const balanceLamports = balance ? balance * LAMPORTS_PER_SOL : 0;

      if (token === "SOL") {
        const amountBase = Math.round(parsed * LAMPORTS_PER_SOL);
        if (amountBase + CLAIM_FEE_LAMPORTS * 2 > balanceLamports) {
          throw new Error(`Not enough SOL. You have ${balance?.toFixed(4) ?? 0} SOL`);
        }
      } else {
        if ((usdcBalance ?? 0) < parsed) {
          throw new Error(`Not enough USDC. You have $${(usdcBalance ?? 0).toFixed(2)}`);
        }
        if (balanceLamports < USDC_GIFT_SENDER_LAMPORTS + CLAIM_FEE_LAMPORTS) {
          throw new Error("USDC gifts need ~0.005 SOL for network costs");
        }
      }

      setStatus("auth");
      const { keypair: sender } = await getPasskeyKeypair(publicKey);
      if (sender.publicKey.toBase58() !== publicKey) {
        throw new Error(
          `That passkey belongs to a different wallet. Pick the passkey for ${walletLabel || `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`}, or switch wallets in the menu.`
        );
      }

      setStatus("sending");
      const createRes = await fetch("/api/gift/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amount: parsed,
          token,
          network,
          message: message || undefined,
        }),
      });
      const created = (await createRes.json()) as {
        ok?: boolean;
        error?: string;
        transaction?: string;
        giftPubkey?: string;
        claimUrl?: string;
        amountLamports?: number;
        blockhash?: string;
        lastValidBlockHeight?: number;
        register?: { body: Record<string, unknown> };
      };
      if (!createRes.ok || !created.transaction || !created.claimUrl || !created.giftPubkey) {
        throw new Error(created.error || "Could not build gift");
      }

      const connection = new Connection(rpc, "confirmed");
      const tx = Transaction.from(Buffer.from(created.transaction, "base64"));
      tx.partialSign(sender);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      setStatus("confirming");
      const bh = created.blockhash;
      const lv = created.lastValidBlockHeight;
      if (bh && lv != null) {
        await connection.confirmTransaction(
          { signature, blockhash: bh, lastValidBlockHeight: lv },
          "confirmed"
        );
      } else {
        await connection.confirmTransaction(signature, "confirmed");
      }

      const url = created.claimUrl;
      const entry: GiftLinkEntry = {
        pubkey: created.giftPubkey,
        url,
        amount: parsed,
        token,
        network,
        createdAt: new Date().toISOString(),
      };
      saveGiftLink(entry);
      refreshLinks();
      fetch("/api/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          created.register?.body || {
            publicKey: entry.pubkey,
            sender: publicKey,
            amountLamports: created.amountLamports,
            network,
            token,
          }
        ),
      }).catch(() => {});
      analytics.giftLinkCreated(parsed);

      setGiftUrl(url);
      setGiftEntry(entry);
      setStatus("done");
      startCancelWindow();
      await refreshBalance();
      const { toast } = await import("sonner");
      toast.success("Gift link created!");
      try {
        new Audio("/chaching.mp3").play();
      } catch {
        /* ignore */
      }
    } catch (err) {
      const { friendlyError } = await import("@/lib/friendly-errors");
      setError(friendlyError(err, "We couldn't create the gift. Try again."));
      setStatus("error");
    }
  };

  const copyLink = () => {
    if (!giftUrl) return;
    navigator.clipboard.writeText(giftUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (!giftUrl) return;
    try {
      await navigator.share({ title: "You've been sent crypto", url: giftUrl });
    } catch {
      copyLink();
    }
  };

  const handleReclaim = async (entry: GiftLinkEntry): Promise<boolean> => {
    if (!publicKey) return false;
    setReclaiming(entry.pubkey);
    const { toast } = await import("sonner");
    try {
      const secret = parseGiftSecret(new URL(entry.url).hash);
      const gift = secret ? keypairFromSecret(secret) : null;
      if (!gift) throw new Error("Couldn't read this link");
      const connection = new Connection(rpc, "confirmed");
      const { lamports, usdcBase } = await sweepGift(
        connection,
        gift,
        new PublicKey(publicKey),
        entry.network
      );
      fetch("/api/gift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: entry.pubkey, claimedBy: publicKey, reclaim: true }),
      }).catch(() => {});
      removeGiftLink(entry.pubkey);
      refreshLinks();
      await refreshBalance();
      toast.success(
        usdcBase > 0
          ? `Reclaimed $${(usdcBase / 1e6).toFixed(2)} USDC`
          : `Reclaimed ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
      return true;
    } catch (err) {
      const { friendlyError } = await import("@/lib/friendly-errors");
      toast.error(friendlyError(err, "Couldn't reclaim this gift."));
      return false;
    } finally {
      setReclaiming(null);
    }
  };

  const handleCancelGift = async () => {
    if (!giftEntry || !publicKey) return;
    setCancelling(true);
    const ok = await handleReclaim(giftEntry);
    setCancelling(false);
    if (ok) {
      if (cancelTimer.current) clearInterval(cancelTimer.current);
      setCancelLeft(0);
      setGiftUrl(null);
      setGiftEntry(null);
      setStatus("idle");
      setAmount("");
      setMessage("");
    }
  };

  const reset = () => {
    if (cancelTimer.current) clearInterval(cancelTimer.current);
    setGiftUrl(null);
    setGiftEntry(null);
    setCancelLeft(0);
    setAmount("");
    setMessage("");
    setCopied(false);
    setStatus("idle");
    setError(null);
  };

  const busy = status === "auth" || status === "sending" || status === "confirming";
  const pendingLinks = links.filter(
    (l) =>
      l.network === network &&
      linkStatuses[l.pubkey] !== "claimed" &&
      linkStatuses[l.pubkey] !== "reclaimed" &&
      l.pubkey !== giftEntry?.pubkey
  );
  const fmtEntry = (l: GiftLinkEntry) => (l.token === "USDC" ? `$${l.amount}` : `${l.amount} SOL`);
  const setMax = () => {
    const max = token === "SOL" ? Math.max(0, (balance ?? 0) - 0.0001) : (usdcBalance ?? 0);
    setAmount(max > 0 ? String(Math.floor(max * 10000) / 10000) : "");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="send a gift">
          <div className="w-full sm:max-w-lg space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Gift} size={40} className="text-amber-400" />
              <h1 className="text-3xl font-bold tracking-tight">Send crypto with a link</h1>
              <p className="text-gray-500 dark:text-white/50">
                They don&apos;t need a wallet — the link is the gift. Anyone who opens it can claim with
                Face ID.
              </p>
            </div>

            {giftUrl ? (
              <div className="space-y-4">
                {/* Cancel window */}
                {cancelLeft > 0 && giftEntry && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                          Cancel gift?
                        </p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                          Funds return to your wallet. {cancelLeft}s left for quick cancel — you can
                          still reclaim later below.
                        </p>
                      </div>
                      <span className="font-mono text-lg font-bold text-red-500 tabular-nums shrink-0">
                        {cancelLeft}s
                      </span>
                    </div>
                    <button
                      onClick={handleCancelGift}
                      disabled={cancelling}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer"
                    >
                      {cancelling ? (
                        <>
                          <Spinner size={16} /> Cancelling…
                        </>
                      ) : (
                        <>
                          <X size={16} /> Cancel and reclaim funds
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center space-y-4">
                  <canvas ref={canvasRef} className="rounded-xl" />
                  <div className="text-center">
                    <p className="text-gray-900 dark:text-white font-semibold text-lg">
                      {token === "USDC" ? `$${amount} USDC` : `${amount} SOL`}
                    </p>
                    {message && (
                      <p className="text-gray-500 dark:text-white/40 text-sm">&ldquo;{message}&rdquo;</p>
                    )}
                  </div>
                  <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-amber-600 dark:text-amber-400 text-xs">
                    This link <strong>is</strong> the money. Anyone who has it can claim it — share it
                    only with the person it&apos;s for.
                  </div>
                  <div
                    onClick={copyLink}
                    className="w-full bg-black/5 dark:bg-black/50 rounded-lg px-4 py-3 font-mono text-xs text-gray-500 dark:text-white/50 break-all cursor-pointer hover:text-gray-700 dark:hover:text-white/70 transition"
                  >
                    {giftUrl}
                  </div>
                  <div className="w-full flex gap-2">
                    <button
                      onClick={copyLink}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" /> Copied!
                        </>
                      ) : (
                        "Copy link"
                      )}
                    </button>
                    <button
                      onClick={shareLink}
                      className="bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 transition cursor-pointer"
                      title="Share"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  {cancelLeft === 0 && giftEntry && (
                    <button
                      onClick={handleCancelGift}
                      disabled={cancelling || reclaiming === giftEntry.pubkey}
                      className="w-full text-xs text-gray-500 dark:text-white/40 hover:text-red-500 transition cursor-pointer flex items-center justify-center gap-1 py-1"
                    >
                      {cancelling ? <Spinner size={12} /> : <Undo2 size={12} />} Cancel gift / reclaim
                    </button>
                  )}
                </div>
                <button
                  onClick={reset}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                >
                  Send another gift
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono">
                    {token === "SOL" ? "◎" : "$"}
                  </span>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    disabled={busy}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/25 transition font-mono text-2xl disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    {PRESETS[token].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setAmount(preset)}
                        disabled={busy}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                          amount === preset
                            ? "bg-amber-500/20 border-amber-400/50 text-amber-600 dark:text-amber-300"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-amber-400/40"
                        }`}
                      >
                        {token === "SOL" ? `◎${preset}` : `$${preset}`}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={setMax}
                    disabled={busy}
                    className="text-xs text-gray-400 dark:text-white/40 hover:text-amber-500 dark:hover:text-amber-400 transition cursor-pointer font-mono whitespace-nowrap"
                    title="Use full balance"
                  >
                    {token === "SOL"
                      ? `◎ ${(balance ?? 0).toFixed(4)}`
                      : `$${(usdcBalance ?? 0).toFixed(2)}`}{" "}
                    max
                  </button>
                </div>
                <div className="flex gap-2">
                  {TOKENS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setToken(t)}
                      disabled={busy}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                        token === t
                          ? "bg-amber-500/20 border-amber-400/50 text-amber-600 dark:text-amber-300"
                          : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20"
                      }`}
                    >
                      {t === "USDC" ? "USDC (dollars)" : "SOL"}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Add a message (optional)"
                  value={message}
                  maxLength={80}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/25 transition disabled:opacity-50"
                />

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <SlideToSend
                  onConfirm={handleCreate}
                  disabled={!amount || busy}
                  loading={busy}
                  label={`Slide to create ${token} gift`}
                  loadingLabel={
                    status === "auth"
                      ? "Authenticating…"
                      : status === "confirming"
                        ? "Confirming…"
                        : "Funding gift…"
                  }
                  tone="amber"
                />
                <p className="text-center text-xs text-gray-400 dark:text-white/30">
                  After create you get {CANCEL_WINDOW_SEC}s to cancel. Unclaimed gifts can be reclaimed
                  anytime.
                </p>
              </div>
            )}

            {pendingLinks.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60">
                  Your unclaimed gifts
                </h2>
                {pendingLinks.map((l) => (
                  <div
                    key={l.pubkey}
                    className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{fmtEntry(l)}</p>
                      <p className="text-xs text-gray-400 dark:text-white/30 truncate">
                        {new Date(l.createdAt).toLocaleDateString()} · {l.pubkey.slice(0, 4)}…
                        {l.pubkey.slice(-4)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(l.url);
                      }}
                      className="text-xs text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition cursor-pointer flex items-center gap-1"
                      title="Copy link"
                    >
                      <ExternalLink size={12} /> Copy
                    </button>
                    <button
                      onClick={() => handleReclaim(l)}
                      disabled={reclaiming === l.pubkey}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      {reclaiming === l.pubkey ? <Spinner size={12} /> : <Undo2 size={12} />} Reclaim
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
