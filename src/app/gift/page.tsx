"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Gift, Check, Share2, Undo2, Copy, X, ChevronDown } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { SlideToSend } from "@/components/slide-to-send";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useDefaultToken } from "@/lib/currency-pref";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import {
  CLAIM_FEE_LAMPORTS,
  SPL_GIFT_FUND_LAMPORTS,
  keypairFromSecret,
  parseGiftSecret,
  sweepGift,
  loadGiftLinks,
  saveGiftLink,
  removeGiftLink,
  giftTokenLabel,
  isNativeGiftToken,
  type GiftLinkEntry,
  type GiftToken,
} from "@/lib/gift-link";
import { analytics } from "@/lib/analytics";
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import QRCode from "qrcode";
import {
  fetchWalletTokens,
  formatTokenUi,
  type WalletToken,
} from "@/lib/wallet-tokens";
import { AmountUsdHint, TokenMetaRow } from "@/components/token-meta";

type Status = "idle" | "auth" | "sending" | "confirming" | "done" | "error";

const PRESETS_SOL = ["0.05", "0.1", "0.5", "1"];
const PRESETS_USDC = ["5", "10", "20", "50"];
const SPL_GIFT_SENDER_LAMPORTS = SPL_GIFT_FUND_LAMPORTS + 2_100_000;

/** Seconds after create during which cancel is prominently offered. */
const CANCEL_WINDOW_SEC = 30;

export default function GiftPage() {
  const [defaultToken] = useDefaultToken();
  const [amount, setAmount] = useState("");
  const [holdings, setHoldings] = useState<WalletToken[]>([]);
  const [selected, setSelected] = useState<WalletToken | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [giftEntry, setGiftEntry] = useState<GiftLinkEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [links, setLinks] = useState<GiftLinkEntry[]>([]);
  const [linkStatuses, setLinkStatuses] = useState<Record<string, string>>({});
  const [reclaiming, setReclaiming] = useState<string | null>(null);
  const [cancelLeft, setCancelLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { publicKey, walletLabel, balance, usdcBalance, refreshBalance, walletKind } = useWallet();
  const { network, rpc } = useNetwork();

  const token: GiftToken = selected
    ? selected.isNativeSol
      ? "SOL"
      : selected.symbol === "USDC"
        ? "USDC"
        : selected.mint
    : "SOL";
  const tokenSymbol = selected?.symbol || "SOL";

  useEffect(() => {
    if (!publicKey) {
      setHoldings([]);
      setSelected(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const conn = new Connection(rpc, "confirmed");
        const list = await fetchWalletTokens(conn, publicKey, { solBalance: balance });
        if (cancelled) return;
        setHoldings(list);
        setSelected((prev) => {
          if (prev) {
            const again = list.find((t) => t.mint === prev.mint);
            if (again) return again;
          }
          if (defaultToken === "USDC") {
            return list.find((t) => t.symbol === "USDC") || list[0] || null;
          }
          return list[0] || null;
        });
      } catch {
        if (!cancelled) setHoldings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, rpc, balance, defaultToken]);

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
    if (!publicKey || !selected) return;
    setError(null);
    setGiftUrl(null);
    setGiftEntry(null);
    setStatus("auth");

    try {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) throw new Error("Enter an amount");

      const balanceLamports = balance ? balance * LAMPORTS_PER_SOL : 0;

      if (selected.isNativeSol) {
        const amountBase = Math.round(parsed * LAMPORTS_PER_SOL);
        // rent-exempt gift account + claim buffer + fee
        if (amountBase + CLAIM_FEE_LAMPORTS * 2 + 5_000 > balanceLamports) {
          throw new Error(
            `Not enough SOL. Need gift amount + ~0.003 SOL for fees (you have ${balance?.toFixed(4) ?? 0} SOL)`,
          );
        }
      } else {
        if (parsed > selected.uiAmount + 1e-12) {
          throw new Error(
            `Not enough ${selected.symbol}. You have ${formatTokenUi(selected.uiAmount, selected.decimals)}`,
          );
        }
        if (balanceLamports < SPL_GIFT_SENDER_LAMPORTS + CLAIM_FEE_LAMPORTS) {
          throw new Error("Token gifts need ~0.005 SOL for network costs");
        }
      }

      // ── Auth first ────────────────────────────────────────────────
      let sender: import("@solana/web3.js").Keypair | null = null;
      const {
        hasExternalWalletSession,
        getInjectedProvider,
      } = await import("@/lib/external-wallet");

      if (walletKind === "external") {
        if (!hasExternalWalletSession() && !getInjectedProvider()) {
          throw new Error(
            "Browser wallet disconnected. Tap connect and pick a wallet again.",
          );
        }
      } else {
        const { keypair } = await getPasskeyKeypair(publicKey);
        if (keypair.publicKey.toBase58() !== publicKey) {
          throw new Error(
            `That passkey belongs to a different wallet. Pick the passkey for ${walletLabel || `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`}, or switch wallets in the menu.`,
          );
        }
        sender = keypair;
      }

      setStatus("sending");
      const createRes = await fetch("/api/gift/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amount: parsed,
          token,
          decimals: selected.decimals,
          programId: selected.isNativeSol ? undefined : selected.programId,
          symbol: selected.symbol,
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
      let tx = Transaction.from(Buffer.from(created.transaction, "base64"));
      // Ensure fee payer + blockhash are set for wallet simulators
      tx.feePayer = new PublicKey(publicKey);
      if (created.blockhash) tx.recentBlockhash = created.blockhash;

      let signature: string;

      if (walletKind === "external") {
        setStatus("auth");
        const {
          signAndSendWithExternal,
          signTransactionWithInjected,
        } = await import("@/lib/external-wallet");

        // Prefer wallet-native sign+send (mobile Phantom etc.)
        const sent = await signAndSendWithExternal(tx, {
          skipPreflight: false,
          maxRetries: 3,
        });
        if (sent) {
          signature = sent;
        } else {
          const signed = await signTransactionWithInjected(tx);
          setStatus("sending");
          // signed may be Transaction or opaque — normalize serialize
          const raw =
            typeof (signed as Transaction).serialize === "function"
              ? (signed as Transaction).serialize({
                  requireAllSignatures: false,
                  verifySignatures: false,
                })
              : Buffer.from(signed as unknown as ArrayBuffer);
          signature = await connection.sendRawTransaction(raw, {
            skipPreflight: false,
            maxRetries: 3,
          });
        }
      } else {
        if (!sender) throw new Error("Passkey authentication required. Gift was not sent.");
        // Fresh blockhash after Face ID so the tx doesn't expire mid-prompt
        let confirmBh = created.blockhash;
        let confirmLv = created.lastValidBlockHeight;
        try {
          const latest = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = latest.blockhash;
          tx.feePayer = sender.publicKey;
          confirmBh = latest.blockhash;
          confirmLv = latest.lastValidBlockHeight;
        } catch {
          tx.feePayer = sender.publicKey;
          if (created.blockhash) tx.recentBlockhash = created.blockhash;
        }
        tx.partialSign(sender);
        signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        created.blockhash = confirmBh;
        created.lastValidBlockHeight = confirmLv;
      }

      setStatus("confirming");
      const bh = created.blockhash;
      const lv = created.lastValidBlockHeight;
      if (bh && lv != null) {
        await connection.confirmTransaction(
          { signature, blockhash: bh, lastValidBlockHeight: lv },
          "confirmed",
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
        symbol: selected.symbol,
        decimals: selected.decimals,
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
          },
        ),
      }).catch(() => {});
      analytics.giftLinkCreated(parsed);

      setGiftUrl(url);
      setGiftEntry(entry);
      setStatus("done");
      startCancelWindow();
      await refreshBalance();
      const { toast } = await import("@/lib/toast");
      toast.success("Gift link created!");
      try {
        new Audio("/chaching.mp3").play();
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error("[gift create]", err);
      const { friendlyError } = await import("@/lib/friendly-errors");
      const raw = err instanceof Error ? err.message : String(err);
      let msg = friendlyError(err, "We couldn't create the gift. Try again.");
      // Surface real cause when generic connector message
      if (/failed to sign/i.test(raw) || /failed to sign/i.test(msg)) {
        msg =
          walletKind === "external"
            ? "Wallet couldn't sign the gift. Reconnect your wallet (or use a passkey), approve the prompt, and try again."
            : "Couldn't sign with passkey. Slide again and approve Face ID / fingerprint.";
      }
      if (/simulation|insufficient|0x1/i.test(raw)) {
        msg = friendlyError(err, "Not enough SOL for gift amount + fees.");
      }
      setError(msg);
      setStatus("error");
      setGiftUrl(null);
      setGiftEntry(null);
      try {
        const { toast } = await import("@/lib/toast");
        toast.error(msg);
      } catch {
        /* ignore */
      }
    }
  };

  const copyText = async (text: string): Promise<boolean> => {
    const value = (text || "").trim();
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  /** Prefer absolute claim URL with hash secret intact */
  const giftLinkHref = (entry: GiftLinkEntry): string => {
    const raw = (entry.url || "").trim();
    if (!raw) {
      // Rebuild from pubkey alone is useless without secret — still return claim base
      return `${typeof window !== "undefined" ? window.location.origin : "https://sol.new"}/gift`;
    }
    try {
      // Already absolute
      if (/^https?:\/\//i.test(raw)) return raw;
      // Relative /gift#... or gift#...
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://sol.new";
      if (raw.startsWith("/")) return `${origin}${raw}`;
      if (raw.startsWith("#")) return `${origin}/gift${raw}`;
      return `${origin}/${raw.replace(/^\//, "")}`;
    } catch {
      return raw;
    }
  };

  const copyLink = async () => {
    if (!giftUrl) return;
    const ok = await copyText(giftUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const { toast } = await import("@/lib/toast");
      toast.success("Gift link copied");
    } else {
      const { toast } = await import("@/lib/toast");
      toast.error("Couldn't copy — long-press the link instead");
    }
  };

  const copyUnclaimedLink = async (entry: GiftLinkEntry) => {
    const href = giftLinkHref(entry);
    const ok = await copyText(href);
    const { toast } = await import("@/lib/toast");
    if (ok) {
      setCopiedLinkId(entry.pubkey);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success("Gift link copied");
    } else {
      toast.error("Couldn't copy link");
    }
  };

  const shareLink = async () => {
    if (!giftUrl) return;
    const { giftSharePayload, shareOrCopy } = await import("@/lib/share-copy");
    const payload = giftSharePayload({
      amount: amount || giftEntry?.amount || "",
      assetLabel:
        giftEntry?.symbol ||
        giftEntry?.tokenSymbol ||
        giftTokenLabel(giftEntry?.token) ||
        tokenSymbol,
      giftUrl,
      message,
      senderLabel: walletLabel || null,
    });
    try {
      const how = await shareOrCopy(payload);
      if (how === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      analytics.shareClicked("gift", giftUrl);
    } catch {
      /* cancelled */
    }
  };

  const handleReclaim = async (entry: GiftLinkEntry): Promise<boolean> => {
    if (!publicKey) return false;
    setReclaiming(entry.pubkey);
    const { toast } = await import("@/lib/toast");
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
  const fmtEntry = (l: GiftLinkEntry) => {
    const sym = giftTokenLabel(l.token, l.symbol);
    if (sym === "USDC") return `$${l.amount} USDC`;
    if (sym === "SOL") return `${l.amount} SOL`;
    return `${l.amount} ${sym}`;
  };
  const setMax = () => {
    if (!selected) return;
    if (selected.isNativeSol) {
      const max = Math.max(0, (balance ?? 0) - 0.0001);
      setAmount(max > 0 ? String(Math.floor(max * 10000) / 10000) : "");
    } else {
      setAmount(formatTokenUi(selected.uiAmount, selected.decimals));
    }
  };
  const presets =
    token === "SOL" ? PRESETS_SOL : token === "USDC" ? PRESETS_USDC : [];
  const displayAmountLabel = () => {
    if (token === "USDC") return `$${amount} USDC`;
    if (isNativeGiftToken(token)) return `${amount} SOL`;
    return `${amount} ${tokenSymbol}`;
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
                      {displayAmountLabel()}
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPickerOpen(true)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-3 text-left"
                >
                  {selected ? (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <TokenMetaRow token={selected} dense />
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Select token</span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </button>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono text-sm">
                    {token === "USDC" ? "$" : token === "SOL" ? "◎" : ""}
                  </span>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    disabled={busy}
                    className={`w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl ${
                      token === "SOL" || token === "USDC" ? "pl-8" : "pl-4"
                    } pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/25 transition font-mono text-2xl disabled:opacity-50`}
                  />
                </div>
                <AmountUsdHint amount={amount} priceUsd={selected?.priceUsd} />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(preset)}
                        disabled={busy}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                          amount === preset
                            ? "bg-amber-500/20 border-amber-400/50 text-amber-600 dark:text-amber-300"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-amber-400/40"
                        }`}
                      >
                        {token === "SOL" ? `◎${preset}` : token === "USDC" ? `$${preset}` : preset}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={setMax}
                    disabled={busy || !selected}
                    className="text-xs text-gray-400 dark:text-white/40 hover:text-amber-500 dark:hover:text-amber-400 transition cursor-pointer font-mono whitespace-nowrap"
                    title="Use full balance"
                  >
                    max
                  </button>
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
                  disabled={!amount || busy || !selected}
                  loading={busy}
                  label={`Slide to create ${tokenSymbol} gift`}
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
                  anytime. Any SPL token works.
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
                      type="button"
                      onClick={() => void copyUnclaimedLink(l)}
                      className="text-xs text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition cursor-pointer flex items-center gap-1 shrink-0"
                      title="Copy gift claim link"
                    >
                      {copiedLinkId === l.pubkey ? (
                        <>
                          <Check size={12} className="text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy
                        </>
                      )}
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

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative w-full sm:max-w-md max-h-[75dvh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-950 border border-black/10 dark:border-white/10 shadow-xl flex flex-col">
            <div className="p-4 border-b border-black/5 dark:border-white/10">
              <p className="text-sm font-semibold">Gift any token</p>
            </div>
            <div className="overflow-y-auto p-2 pb-6">
              {holdings.map((t) => (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => {
                    setSelected(t);
                    setAmount("");
                    setPickerOpen(false);
                  }}
                  className={`w-full px-3 py-3 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5 ${
                    selected?.mint === t.mint ? "bg-amber-500/10" : ""
                  }`}
                >
                  <TokenMetaRow
                    token={t}
                    right={
                      <span className="font-mono text-xs tabular-nums text-right shrink-0">
                        {formatTokenUi(t.uiAmount, t.decimals)}
                        {t.valueUsd != null && t.valueUsd >= 0.01 && (
                          <span className="block text-[10px] text-gray-400">
                            ${t.valueUsd.toFixed(2)}
                          </span>
                        )}
                      </span>
                    }
                  />
                </button>
              ))}
              {holdings.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No tokens in this wallet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
