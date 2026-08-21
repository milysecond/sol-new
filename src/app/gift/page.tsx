"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Gift, Check, Share2, Undo2, Copy, X, ChevronDown, Link2, Globe, ExternalLink } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { FeedbackModal } from "@/components/feedback-modal";
import { TxConfirm } from "@/components/tx-confirm";
import { SlideToSend } from "@/components/slide-to-send";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useDefaultToken } from "@/lib/currency-pref";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { broadcastSignedTx } from "@/lib/broadcast-tx";
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
  giftPublicUrl,
  giftClaimUrlAbsolute,
  isNativeGiftToken,
  type GiftLinkEntry,
  type GiftToken,
} from "@/lib/gift-link";
import { addressPath } from "@/lib/explorer";
import { TokenIcon } from "@/components/token-meta";
import { analytics } from "@/lib/analytics";
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import QRCode from "qrcode";
import {
  fetchWalletTokens,
  formatTokenUi,
  formatAmountInput,
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
  /** public = direct fund · hop = unlink hop · zk = Privacy Cash withdraw to gift */
  const [privacyMode, setPrivacyMode] = useState<"public" | "hop" | "zk">("zk");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showFb, setShowFb] = useState(false);
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
  const { network, rpc, rotateMainnetRpc } = useNetwork();

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
        // Prefer live wallet balance for native SOL (portfolio API can return 0)
        const solBal = typeof balance === "number" ? balance : null;
        const merged = list.map((t) => {
          if (t.isNativeSol && solBal != null && Number.isFinite(solBal)) {
            return {
              ...t,
              uiAmount: solBal,
              amount: String(Math.round(solBal * 1e9)),
            };
          }
          return t;
        });
        // If no SOL row, inject one
        if (solBal != null && !merged.some((t) => t.isNativeSol)) {
          merged.unshift({
            mint: "So11111111111111111111111111111111111111112",
            symbol: "SOL",
            name: "Solana",
            decimals: 9,
            uiAmount: solBal,
            amount: String(Math.round(solBal * 1e9)),
            isNativeSol: true,
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            priceUsd: null,
            valueUsd: null,
          } as (typeof list)[0]);
        }
        setHoldings(merged);
        setSelected((prev) => {
          if (prev) {
            const again = merged.find((t) => t.mint === prev.mint);
            if (again) return again;
          }
          if (defaultToken === "USDC") {
            return merged.find((t) => t.symbol === "USDC") || merged[0] || null;
          }
          return merged[0] || null;
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

  // Enrich old gifts that only stored truncated mint as symbol
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = loadGiftLinks();
      let changed = false;
      const next = await Promise.all(
        list.map(async (l) => {
          const tok = l.token;
          if (!tok || tok === "SOL" || tok === "USDC" || tok.length < 32) return l;
          const badSym =
            !l.symbol ||
            l.symbol.includes("…") ||
            l.symbol.length > 20 ||
            /^[1-9A-HJ-NP-Za-km-z]{3,4}…/.test(l.symbol);
          if (!badSym && l.icon) return l;
          try {
            const r = await fetch(`/api/swap/search?q=${encodeURIComponent(tok)}`, {
              cache: "no-store",
            });
            if (!r.ok) return l;
            const j = (await r.json()) as {
              tokens?: { id?: string; symbol?: string; name?: string; icon?: string }[];
            };
            const hit = (j.tokens || []).find(
              (x) => x.id === tok || x.id?.toLowerCase() === tok.toLowerCase(),
            );
            if (!hit) return l;
            changed = true;
            return {
              ...l,
              symbol: hit.symbol || l.symbol,
              icon: hit.icon || l.icon,
            };
          } catch {
            return l;
          }
        }),
      );
      if (cancelled || !changed) return;
      try {
        localStorage.setItem("sol.new.giftLinks", JSON.stringify(next.slice(0, 50)));
      } catch {
        /* ignore */
      }
      setLinks(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Network switch → reset form state that is network-specific
  useEffect(() => {
    setError(null);
    setStatus("idle");
    setGiftUrl(null);
    setGiftEntry(null);
    setCancelLeft(0);
    setCopied(false);
    if (cancelTimer.current) {
      clearInterval(cancelTimer.current);
      cancelTimer.current = null;
    }
    // ZK Privacy Cash hosted pool is mainnet-only
    if (network !== "mainnet" && privacyMode === "zk") {
      setPrivacyMode("hop");
    }
    // Clear amount so presets don't look "funded" on empty chain
    setAmount("");
    void refreshBalance();
  }, [network]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // ── ZK private gift (Privacy Cash) ─────────────────────────────
      if (privacyMode === "zk") {
        if (network !== "mainnet") {
          throw new Error("ZK private gifts are mainnet-only. Switch to live.");
        }
        if (!selected.isNativeSol && selected.symbol !== "SOL") {
          throw new Error("ZK gifts support SOL only right now. Use hop mode for tokens.");
        }
        setStatus("auth");
        const {
          openPrivacyCashSession,
          getPrivateSolBalance,
          shieldSol,
          privateSendSol,
          solToLamports,
        } = await import("@/lib/privacy-cash");
        const {
          createGiftKeypair,
          buildGiftUrl,
          CLAIM_FEE_LAMPORTS: claimFee,
        } = await import("@/lib/gift-link");
        const session = await openPrivacyCashSession(rpc);
        let privBal = await getPrivateSolBalance(session);
        const needSol = parsed + claimFee / 1e9 + 0.002; // amount + claim buffer + slack
        if (privBal + 1e-9 < needSol) {
          // Auto-shield shortfall from public wallet
          const shortfall = needSol - privBal;
          const publicSol = balance ?? 0;
          if (publicSol < shortfall + 0.003) {
            throw new Error(
              `Need ~${needSol.toFixed(4)} SOL private (have ${privBal.toFixed(4)}). Public also short — top up or shield first on /private.`,
            );
          }
          setStatus("sending");
          await shieldSol(session, solToLamports(shortfall), () => setStatus("sending"));
          privBal = await getPrivateSolBalance(session);
        }
        const { keypair: giftKp, secret } = createGiftKeypair();
        const fundLamports = solToLamports(parsed) + claimFee;
        setStatus("sending");
        await privateSendSol(session, fundLamports, giftKp.publicKey, () =>
          setStatus("confirming"),
        );
        const origin = typeof window !== "undefined" ? window.location.origin : "https://sol.new";
        const url = buildGiftUrl(secret, network, message || undefined, origin);
        const entry: GiftLinkEntry = {
          pubkey: giftKp.publicKey.toBase58(),
          url,
          amount: parsed,
          token: "SOL",
          symbol: "SOL",
          icon: selected.icon,
          decimals: 9,
          network,
          createdAt: new Date().toISOString(),
        };
        saveGiftLink(entry);
        refreshLinks();
        fetch("/api/gift", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: entry.pubkey,
            sender: "private",
            amountLamports: solToLamports(parsed),
            network,
            token: "SOL",
            private: true,
          }),
        }).catch(() => {});
        analytics.giftLinkCreated(parsed);
        setGiftUrl(url);
        setGiftEntry(entry);
        setStatus("done");
        startCancelWindow();
        await refreshBalance();
        const { toast } = await import("@/lib/toast");
        toast.success("ZK private gift created!");
        setShowFb(true);
        try {
          new Audio("/chaching.mp3").play();
        } catch {
          /* ignore */
        }
        return;
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
          // Server always resolves Token vs Token-2022; only pass if Token-2022 known
          programId:
            selected.isNativeSol || selected.symbol === "USDC"
              ? undefined
              : selected.programId?.includes("Tokenz")
                ? selected.programId
                : undefined,
          symbol: selected.symbol,
          network,
          message: message || undefined,
          private: privacyMode === "hop",
        }),
      });
      const created = (await createRes.json()) as {
        ok?: boolean;
        error?: string;
        private?: boolean;
        transaction?: string;
        transaction2?: string;
        hopSecret?: string;
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
      const isPrivateGift = Boolean(created.private && created.transaction2 && created.hopSecret);

      async function signSendUserTx(txIn: Transaction): Promise<string> {
        if (!publicKey) throw new Error("Wallet not connected");
        let tx = txIn;
        tx.feePayer = new PublicKey(publicKey);
        if (created.blockhash) tx.recentBlockhash = created.blockhash;

        if (walletKind === "external") {
          setStatus("auth");
          const {
            signAndSendWithExternal,
            signTransactionWithInjected,
          } = await import("@/lib/external-wallet");
          const sent = await signAndSendWithExternal(tx, {
            skipPreflight: false,
            maxRetries: 3,
          });
          if (sent) return sent;
          const signed = await signTransactionWithInjected(tx);
          setStatus("sending");
          const raw =
            typeof (signed as Transaction).serialize === "function"
              ? (signed as Transaction).serialize({
                  requireAllSignatures: false,
                  verifySignatures: false,
                })
              : Buffer.from(signed as unknown as ArrayBuffer);
          return broadcastSignedTx(raw, {
            rpc,
            rotateMainnetRpc,
            skipPreflight: false,
          });
        }
        if (!sender) throw new Error("Passkey authentication required. Gift was not sent.");
        try {
          const latest = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = latest.blockhash;
          created.blockhash = latest.blockhash;
          created.lastValidBlockHeight = latest.lastValidBlockHeight;
        } catch {
          if (created.blockhash) tx.recentBlockhash = created.blockhash;
        }
        tx.feePayer = sender.publicKey;
        tx.partialSign(sender);
        return broadcastSignedTx(tx, {
          rpc,
          rotateMainnetRpc,
          skipPreflight: false,
        });
      }

      // Tx1: fund hop (private) or fund gift (standard)
      setStatus("sending");
      let tx1 = Transaction.from(Buffer.from(created.transaction, "base64"));
      const signature = await signSendUserTx(tx1);

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

      // Tx2 private: hop → gift (signed only by ephemeral hop — not main wallet)
      if (isPrivateGift) {
        setStatus("sending");
        const hop = Keypair.fromSecretKey(Buffer.from(created.hopSecret!, "base64"));
        let tx2 = Transaction.from(Buffer.from(created.transaction2!, "base64"));
        try {
          const latest2 = await connection.getLatestBlockhash("confirmed");
          tx2.recentBlockhash = latest2.blockhash;
          created.blockhash = latest2.blockhash;
          created.lastValidBlockHeight = latest2.lastValidBlockHeight;
        } catch {
          /* keep */
        }
        tx2.feePayer = hop.publicKey;
        tx2.partialSign(hop);
        const sig2 = await broadcastSignedTx(tx2, {
          rpc,
          rotateMainnetRpc,
          skipPreflight: false,
        });
        setStatus("confirming");
        const bh2 = created.blockhash;
        const lv2 = created.lastValidBlockHeight;
        if (bh2 && lv2 != null) {
          await connection.confirmTransaction(
            { signature: sig2, blockhash: bh2, lastValidBlockHeight: lv2 },
            "confirmed",
          );
        } else {
          await connection.confirmTransaction(sig2, "confirmed");
        }
      }

      const url = created.claimUrl;
      const entry: GiftLinkEntry = {
        pubkey: created.giftPubkey,
        url,
        amount: parsed,
        token,
        symbol: selected.symbol,
        icon: selected.icon,
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
      toast.success(privacyMode === "hop" ? "Private hop gift created!" : "Gift link created!");
      setShowFb(true);
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

  const giftLinkHref = (entry: GiftLinkEntry): string =>
    giftClaimUrlAbsolute(entry);

  const publicGiftHref = (entry: GiftLinkEntry): string => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://sol.new";
    return giftPublicUrl(entry.pubkey, origin);
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

  const copyUnclaimedLink = async (
    entry: GiftLinkEntry,
    kind: "claim" | "public" = "claim",
  ) => {
    const href = kind === "public" ? publicGiftHref(entry) : giftLinkHref(entry);
    const ok = await copyText(href);
    const { toast } = await import("@/lib/toast");
    if (ok) {
      setCopiedLinkId(`${entry.pubkey}:${kind}`);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success(kind === "public" ? "Public gift address copied" : "Claim link copied");
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
      senderLabel: privacyMode === "public" ? walletLabel || null : null,
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
    const sym = giftTokenLabel(l.token, l.symbol || l.tokenSymbol);
    if (sym === "USDC") return `$${l.amount} USDC`;
    if (sym === "SOL") return `${l.amount} SOL`;
    return `${l.amount} ${sym}`;
  };
  /** Max gift amount as input-safe string (no commas). Leaves SOL fee reserve for native. */
  const maxGiftUi = (): { ui: number; str: string; dec: number } | null => {
    if (!selected) return null;
    const dec = selected.isNativeSol ? 9 : selected.decimals;
    if (selected.isNativeSol) {
      // Match create() reserve: claim fee×2 + buffer + small tx fee
      const reserve =
        (CLAIM_FEE_LAMPORTS * 2 + 5_000 + 50_000) / LAMPORTS_PER_SOL;
      const ui = Math.max(0, (balance ?? selected.uiAmount ?? 0) - reserve);
      return { ui, str: formatAmountInput(ui, 9), dec: 9 };
    }
    const ui = Math.max(0, selected.uiAmount || 0);
    return { ui, str: formatAmountInput(ui, dec), dec };
  };

  const setMax = () => {
    const m = maxGiftUi();
    if (!m || !m.str) {
      setError(
        selected?.isNativeSol
          ? "Not enough SOL left after gift fees"
          : "No balance",
      );
      return;
    }
    setError(null);
    setAmount(m.str);
  };

  const setPct = (pct: number) => {
    const m = maxGiftUi();
    if (!m || m.ui <= 0) {
      setError("No balance");
      return;
    }
    setError(null);
    setAmount(formatAmountInput(m.ui * pct, m.dec));
  };

  const presets =
    token === "SOL" ? PRESETS_SOL : token === "USDC" ? PRESETS_USDC : [];
  const displayAmountLabel = () => {
    if (token === "USDC") return `$${amount} USDC`;
    if (isNativeGiftToken(token)) return `${amount} SOL`;
    return `${amount} ${tokenSymbol}`;
  };

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="send a gift">
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-8">
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
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer"
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
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5"
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
                      className="bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 rounded-lg px-3.5 py-2.5 transition cursor-pointer"
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
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-lg px-3.5 py-2.5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
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
                    onChange={(e) => setAmount(e.target.value.replace(/,/g, "").replace(/[^0-9.]/g, ""))}
                    disabled={busy}
                    className={`w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl ${
                      token === "SOL" || token === "USDC" ? "pl-8" : "pl-4"
                    } pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/25 transition font-mono text-2xl disabled:opacity-50`}
                  />
                </div>
                <AmountUsdHint amount={amount} priceUsd={selected?.priceUsd} />
                <div className="space-y-2">
                  {/* 25 / 50 / 75 / Max — large touch targets */}
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        [0.25, "25%"],
                        [0.5, "50%"],
                        [0.75, "75%"],
                        [1, "Max"],
                      ] as const
                    ).map(([pct, label]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={busy || !selected}
                        onClick={() => (pct === 1 ? setMax() : setPct(pct))}
                        className={`min-h-[44px] rounded-xl text-sm font-semibold transition border ${
                          label === "Max"
                            ? "bg-amber-500 hover:bg-amber-400 border-amber-400 text-black"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-800 dark:text-white/80 hover:border-amber-400/50"
                        } disabled:opacity-40`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Fixed presets for SOL / USDC */}
                  {presets.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {presets.map((preset) => {
                        const n = parseFloat(preset);
                        const m = maxGiftUi();
                        const over = m != null && Number.isFinite(n) && n > m.ui + 1e-12;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              if (over) {
                                setError(
                                  m && m.ui <= 0
                                    ? "No balance on this network"
                                    : `Only ${m?.str ?? 0} available on ${network}`,
                                );
                                return;
                              }
                              setError(null);
                              setAmount(preset);
                            }}
                            disabled={busy || over || balance === null}
                            className={`min-h-[36px] px-3 rounded-lg text-xs font-mono transition cursor-pointer border touch-manipulation active:scale-95 ${
                              amount === preset
                                ? "bg-amber-500/20 border-amber-400/50 text-amber-600 dark:text-amber-300"
                                : over
                                  ? "opacity-35 border-black/10 dark:border-white/10 text-gray-400"
                                  : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-amber-400/40"
                            }`}
                          >
                            {token === "SOL"
                              ? `◎${preset}`
                              : token === "USDC"
                                ? `$${preset}`
                                : preset}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selected && (
                    <p className="text-[11px] text-gray-400 dark:text-white/35">
                      Available{" "}
                      <span className="font-mono text-gray-600 dark:text-white/60">
                        {balance === null && selected.isNativeSol ? (
                          <span className="inline-flex items-center gap-1">
                            <Spinner size={10} className="inline" /> loading
                          </span>
                        ) : (
                          <>
                            {formatTokenUi(
                              selected.isNativeSol
                                ? (balance ?? selected.uiAmount)
                                : selected.uiAmount,
                              selected.decimals,
                            )}{" "}
                            {selected.symbol}
                          </>
                        )}
                      </span>
                      <span className="text-gray-400 dark:text-white/30">
                        {" "}
                        · {network === "devnet" ? "devnet" : "mainnet"}
                      </span>
                      {selected.isNativeSol ? " · Max keeps a small fee reserve" : ""}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Privacy
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: "zk" as const,
                          label: "ZK",
                          desc:
                            network === "mainnet"
                              ? "Privacy Cash · true unlink"
                              : "Mainnet only",
                          disabled: network !== "mainnet",
                        },
                        {
                          id: "hop" as const,
                          label: "Hop",
                          desc: "One-time wallet hop",
                          disabled: false,
                        },
                        {
                          id: "public" as const,
                          label: "Public",
                          desc: "Direct from wallet",
                          disabled: false,
                        },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={busy || m.disabled}
                        onClick={() => {
                          if (m.disabled) return;
                          setPrivacyMode(m.id);
                          setError(null);
                        }}
                        title={
                          m.disabled ? "Switch to live (mainnet) for ZK gifts" : undefined
                        }
                        className={`rounded-xl border px-2 py-2 text-left transition touch-manipulation active:scale-[0.98] ${
                          m.disabled
                            ? "opacity-40 cursor-not-allowed border-black/10 dark:border-white/10"
                            : privacyMode === m.id
                              ? m.id === "zk"
                                ? "border-purple-400/60 bg-purple-500/15"
                                : m.id === "hop"
                                  ? "border-amber-400/60 bg-amber-500/10"
                                  : "border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5"
                              : "border-black/10 dark:border-white/10 hover:bg-black/[0.03]"
                        }`}
                      >
                        <span className="block text-xs font-bold">{m.label}</span>
                        <span className="block text-[10px] text-gray-500 leading-snug mt-0.5">
                          {m.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                  {network === "devnet" && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
                      You&apos;re on <strong>devnet</strong>. ZK gifts need{" "}
                      <strong>live/mainnet</strong>. Hop &amp; Public work here.
                    </p>
                  )}
                  {privacyMode === "zk" && network === "mainnet" && (
                    <p className="text-[11px] text-purple-600 dark:text-purple-300 leading-snug">
                      Groth16 ZK via Privacy Cash (mainnet SOL). Shields if needed, then privately
                      funds the gift.{" "}
                      <a href="/private" className="underline">
                        Manage private balance
                      </a>
                    </p>
                  )}
                  {privacyMode === "hop" && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
                      Two-tx hop: main → ephemeral → gift. Weaker than ZK; timing can still
                      correlate.
                    </p>
                  )}
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
                  onConfirm={() => {
                    setError(null);
                    if (!amount || !selected) return;
                    setConfirmOpen(true);
                  }}
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
                {pendingLinks.map((l) => {
                  const claimHref = giftLinkHref(l);
                  const pubHref = publicGiftHref(l);
                  const tokenChip = {
                    mint: typeof l.token === "string" && l.token.length > 20 ? l.token : l.pubkey,
                    symbol: giftTokenLabel(l.token, l.symbol || l.tokenSymbol),
                    icon: l.icon,
                  };
                  return (
                    <div
                      key={l.pubkey}
                      className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-3 space-y-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <TokenIcon token={tokenChip} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{fmtEntry(l)}</p>
                          <p className="text-[11px] text-gray-400 dark:text-white/35 truncate font-mono">
                            {new Date(l.createdAt).toLocaleDateString()} · {l.pubkey.slice(0, 4)}…
                            {l.pubkey.slice(-4)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleReclaim(l)}
                          disabled={reclaiming === l.pubkey}
                          className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 transition cursor-pointer flex items-center gap-1 disabled:opacity-50 shrink-0 font-medium"
                        >
                          {reclaiming === l.pubkey ? (
                            <Spinner size={12} />
                          ) : (
                            <Undo2 size={12} />
                          )}{" "}
                          Reclaim
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/10 px-2.5 py-2 space-y-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">
                            <Link2 size={11} className="text-amber-500" /> Claim link
                          </p>
                          <p className="text-[10px] font-mono text-gray-500 dark:text-white/40 truncate">
                            {claimHref.replace(/^https?:\/\//, "")}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void copyUnclaimedLink(l, "claim")}
                              className="flex-1 text-[11px] font-medium py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1"
                            >
                              {copiedLinkId === `${l.pubkey}:claim` ? (
                                <>
                                  <Check size={11} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={11} /> Copy claim
                                </>
                              )}
                            </button>
                            <a
                              href={claimHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1.5 rounded-md border border-black/10 dark:border-white/10 text-gray-500 flex items-center"
                              title="Open claim link"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>

                        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/10 px-2.5 py-2 space-y-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">
                            <Globe size={11} className="text-violet-500" /> Public link
                          </p>
                          <p className="text-[10px] font-mono text-gray-500 dark:text-white/40 truncate">
                            sol.new{addressPath(l.pubkey)}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void copyUnclaimedLink(l, "public")}
                              className="flex-1 text-[11px] font-medium py-1.5 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center gap-1"
                            >
                              {copiedLinkId === `${l.pubkey}:public` ? (
                                <>
                                  <Check size={11} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={11} /> Copy public
                                </>
                              )}
                            </button>
                            <a
                              href={pubHref}
                              className="px-2 py-1.5 rounded-md border border-black/10 dark:border-white/10 text-gray-500 flex items-center"
                              title="View gift wallet on sol.new"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            {confirmOpen && selected && (
              <div className="fixed-vv z-[200] flex items-end sm:items-center justify-center">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => !busy && setConfirmOpen(false)} />
                <div className="relative z-10 w-full sm:max-w-md px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
                  <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-4 sm:p-5 shadow-2xl">
                    <TxConfirm
                      title="Confirm gift"
                      subtitle={`${privacyMode === "zk" ? "ZK private" : privacyMode === "hop" ? "Private hop" : "Public"} gift on ${network}`}
                      kind="send"
                      rows={[
                        { label: "Amount", value: displayAmountLabel(), mono: true },
                        { label: "Token", value: tokenSymbol },
                        { label: "Network", value: network === "devnet" ? "Devnet" : "Mainnet" },
                        { label: "Privacy", value: privacyMode.toUpperCase() },
                      ]}
                      notice={
                        privacyMode === "zk"
                          ? "ZK proof can take 10–30s. Keep the screen on."
                          : "You’ll approve with Face ID / passkey next."
                      }
                      confirmLabel="Create gift"
                      cancelLabel="Back"
                      busy={busy}
                      onCancel={() => setConfirmOpen(false)}
                      onConfirm={() => {
                        setConfirmOpen(false);
                        void handleCreate();
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <FeedbackModal
              open={showFb && Boolean(giftUrl)}
              onClose={() => setShowFb(false)}
              tone="success"
              title="Gift ready!"
              body="Share the claim link. Anyone with it can claim with Face ID."
              primaryLabel="Copy link"
              secondaryLabel="Dismiss"
              onPrimary={() => {
                if (giftUrl) void navigator.clipboard.writeText(giftUrl);
                setShowFb(false);
              }}
            />

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
