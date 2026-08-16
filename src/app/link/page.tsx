"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Check, Copy, ExternalLink, QrCode as QrIcon, Wallet } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Navbar } from "@/components/navbar";
import { AnimatedIcon } from "@/components/animated-icon";
import { QrCode } from "@/components/qr-code";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import {
  absoluteShortUrl,
  CUSTOM_LINK_FEE_LAMPORTS,
  CUSTOM_LINK_FEE_SOL,
  LINK_FEE_VAULT,
  normalizeTargetUrl,
} from "@/lib/short-link";
import { buildSolanaPayTransferUrl, findSignatureByReference } from "@/lib/solana-pay";

type Created = {
  code: string;
  shortUrl: string;
  targetUrl: string;
  title: string | null;
};

type HistoryEntry = {
  code: string;
  shortUrl: string;
  targetUrl: string;
  title?: string | null;
  createdAt: string;
};

const HISTORY_KEY = "sol.new.shortLinks";
const QR_POLL_MS = 2000;
const QR_TIMEOUT_MS = 5 * 60_000;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry: HistoryEntry) {
  const list = loadHistory().filter((e) => e.code !== entry.code);
  list.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
}

const ERROR_COPY: Record<string, string> = {
  missing: "That short link was not found.",
  expired: "That short link has expired.",
  invalid: "Invalid short link.",
  error: "Something went wrong resolving the link.",
};

export default function LinkPage() {
  return (
    <Suspense fallback={<LinkShell />}>
      <LinkPageInner />
    </Suspense>
  );
}

function LinkShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        {children ?? (
          <div className="w-full sm:max-w-lg text-center text-gray-400 py-16">Loading…</div>
        )}
      </main>
    </div>
  );
}

function LinkPageInner() {
  const search = useSearchParams();
  const { publicKey, balance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [url, setUrl] = useState("");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [qrPay, setQrPay] = useState<{
    payUrl: string;
    reference: string;
    startedAt: number;
  } | null>(null);
  const completingRef = useRef(false);
  const banner = search.get("e");
  const wantsCustom = custom.trim().length > 0;

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (banner && ERROR_COPY[banner]) {
      setError(ERROR_COPY[banner] + (search.get("code") ? ` (${search.get("code")})` : ""));
    }
  }, [banner, search]);

  // Drop QR session if user clears custom code / URL
  useEffect(() => {
    if (!wantsCustom || !url.trim()) setQrPay(null);
  }, [wantsCustom, url]);

  const finishCreate = useCallback(
    async (paymentSig?: string, payerWallet?: string | null) => {
      const checked = normalizeTargetUrl(url);
      if (!checked.ok) {
        throw new Error(checked.error);
      }
      setStatusLabel("Creating link…");
      // null = do not bind wallet (Solana Pay QR payer may differ from connected passkey)
      const wallet =
        payerWallet === null ? undefined : payerWallet ?? publicKey ?? undefined;
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: checked.url,
          code: custom.trim() || undefined,
          title: title.trim() || undefined,
          wallet,
          paymentSig,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        shortUrl?: string;
        targetUrl?: string;
        title?: string | null;
      };
      if (!res.ok || !data.ok || !data.code || !data.shortUrl || !data.targetUrl) {
        throw new Error(data.error || "Could not create link");
      }
      const entry: Created = {
        code: data.code,
        shortUrl: data.shortUrl,
        targetUrl: data.targetUrl,
        title: data.title ?? null,
      };
      setCreated(entry);
      saveHistory({
        ...entry,
        createdAt: new Date().toISOString(),
      });
      setHistory(loadHistory());
      setUrl("");
      setCustom("");
      setTitle("");
      setQrPay(null);
    },
    [url, custom, title, publicKey]
  );

  /** Pay custom fee from connected passkey wallet, then create. */
  const createWithPasskey = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCreated(null);
    setStatusLabel(null);
    setQrPay(null);
    try {
      const checked = normalizeTargetUrl(url);
      if (!checked.ok) throw new Error(checked.error);

      let paymentSig: string | undefined;

      if (wantsCustom) {
        if (network === "devnet") {
          throw new Error("Custom codes are paid on mainnet. Switch to live network.");
        }
        if (!publicKey) {
          throw new Error("Connect your wallet, or pay with the Solana Pay QR.");
        }
        if ((balance ?? 0) < CUSTOM_LINK_FEE_SOL + 0.00001) {
          throw new Error(`Need ${CUSTOM_LINK_FEE_SOL} SOL plus a tiny network fee.`);
        }

        setStatusLabel("Paying for custom code…");
        const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
        const { Connection, PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");
        const { keypair } = await getPasskeyKeypair(publicKey);
        if (keypair.publicKey.toBase58() !== publicKey) {
          throw new Error("Passkey does not match the connected wallet.");
        }

        const connection = new Connection(rpc, "confirmed");
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(LINK_FEE_VAULT),
            lamports: CUSTOM_LINK_FEE_LAMPORTS,
          })
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);
        paymentSig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        setStatusLabel("Confirming payment…");
        await connection.confirmTransaction(
          { signature: paymentSig, blockhash, lastValidBlockHeight },
          "confirmed"
        );
        await refreshBalance();
      }

      await finishCreate(paymentSig, publicKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatusLabel(null);
    }
  }, [
    url,
    custom,
    title,
    publicKey,
    wantsCustom,
    network,
    balance,
    rpc,
    refreshBalance,
    finishCreate,
  ]);

  /** Free random code (no payment). */
  const createFree = useCallback(async () => {
    if (wantsCustom) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    setQrPay(null);
    try {
      await finishCreate(undefined, publicKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatusLabel(null);
    }
  }, [wantsCustom, finishCreate, publicKey]);

  /** Start Solana Pay QR session for custom code fee. */
  const startSolanaPayQr = useCallback(async () => {
    setError(null);
    setCreated(null);
    if (!url.trim()) {
      setError("Enter a URL first");
      return;
    }
    if (!wantsCustom) {
      setError("Enter a custom code to pay for");
      return;
    }
    if (network === "devnet") {
      setError("Custom codes are paid on mainnet. Switch to live network.");
      return;
    }

    try {
      const { Keypair } = await import("@solana/web3.js");
      const reference = Keypair.generate().publicKey.toBase58();
      const code = custom.trim().toLowerCase();
      const payUrl = buildSolanaPayTransferUrl({
        recipient: LINK_FEE_VAULT,
        amount: String(CUSTOM_LINK_FEE_SOL),
        label: "sol.new",
        message: `Custom short link /link/${code}`,
        reference,
      });
      setQrPay({ payUrl, reference, startedAt: Date.now() });
      setStatusLabel("Waiting for Solana Pay…");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url, wantsCustom, network, custom]);

  // Poll chain for Solana Pay transfer that includes our reference
  useEffect(() => {
    if (!qrPay) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || completingRef.current) return;
      if (Date.now() - qrPay.startedAt > QR_TIMEOUT_MS) {
        setQrPay(null);
        setStatusLabel(null);
        setError("Payment timed out. Generate a new QR and try again.");
        return;
      }
      try {
        const { Connection, PublicKey } = await import("@solana/web3.js");
        const connection = new Connection(rpc, "confirmed");
        const sig = await findSignatureByReference(
          connection,
          new PublicKey(qrPay.reference)
        );
        if (!sig || cancelled) return;

        completingRef.current = true;
        setBusy(true);
        setStatusLabel("Payment found — creating link…");
        try {
          // Don't bind wallet: payer is whoever scanned the QR
          await finishCreate(sig, null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setQrPay(null);
        } finally {
          setBusy(false);
          setStatusLabel(null);
          completingRef.current = false;
        }
      } catch {
        // transient RPC errors — keep polling
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), QR_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [qrPay, rpc, finishCreate]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const qrHint = useMemo(() => {
    if (!qrPay) return null;
    const secs = Math.max(0, Math.ceil((QR_TIMEOUT_MS - (Date.now() - qrPay.startedAt)) / 1000));
    return secs;
  }, [qrPay, statusLabel]);

  return (
    <LinkShell>
      <div className="w-full sm:max-w-lg space-y-8">
        <div className="text-center space-y-3">
          <AnimatedIcon icon={Link2} size={40} className="text-sky-400" />
          <h1 className="text-3xl font-bold tracking-tight">Short links</h1>
          <p className="text-gray-500 dark:text-white/50">
            Turn any URL into <span className="font-mono text-sky-500">sol.new/link/…</span>
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url && !busy && !wantsCustom) void createFree();
            }}
            disabled={busy || !!qrPay}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition font-mono text-sm disabled:opacity-50"
          />
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-white/30 font-mono">
                /link/
              </span>
              <input
                type="text"
                placeholder="custom (optional)"
                value={custom}
                onChange={(e) =>
                  setCustom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32))
                }
                disabled={busy || !!qrPay}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-14 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition disabled:opacity-50"
              />
            </div>
            <input
              type="text"
              placeholder="Label (optional)"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy || !!qrPay}
              className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition disabled:opacity-50"
            />
          </div>

          {wantsCustom && (
            <div className="bg-amber-500/10 border border-amber-400/25 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Custom codes cost <strong>{CUSTOM_LINK_FEE_SOL} SOL</strong> (mainnet). Pay with{" "}
              <strong>Solana Pay QR</strong> (any wallet) or your connected passkey.
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {qrPay ? (
            <div className="rounded-2xl border border-sky-400/30 bg-sky-500/5 p-5 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                  Scan to pay {CUSTOM_LINK_FEE_SOL} SOL
                </p>
                <p className="text-xs text-gray-500 dark:text-white/45">
                  Phantom, Solflare, or any Solana Pay wallet · /link/{custom.trim().toLowerCase()}
                </p>
              </div>
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl">
                  <QrCode data={qrPay.payUrl} size={220} className="rounded-lg" />
                </div>
              </div>
              <p className="text-center text-xs font-mono text-gray-500 dark:text-white/40 break-all px-2">
                {payUrlPreview(qrPay.payUrl)}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-sky-600 dark:text-sky-400">
                <Spinner size={16} className="w-4 h-4" />
                {statusLabel || "Waiting for payment…"}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy(qrPay.payUrl)}
                  className="flex-1 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy pay link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQrPay(null);
                    setStatusLabel(null);
                  }}
                  disabled={busy}
                  className="flex-1 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm transition hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
                QR expires in ~5 minutes{qrHint != null ? "" : ""}. Keep this tab open.
              </p>
            </div>
          ) : wantsCustom ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void startSolanaPayQr()}
                disabled={!url.trim() || busy}
                className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <QrIcon className="w-4 h-4" />
                Pay with Solana Pay QR · {CUSTOM_LINK_FEE_SOL} SOL
              </button>
              <button
                type="button"
                onClick={() => void createWithPasskey()}
                disabled={!url.trim() || busy || !publicKey}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-40 text-gray-800 dark:text-white/80 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {busy ? (
                  <>
                    <Spinner size={16} className="w-4 h-4" />
                    {statusLabel || "Working…"}
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
                    Pay with connected wallet
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void createFree()}
              disabled={!url.trim() || busy}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Spinner size={16} className="w-4 h-4" />
                  {statusLabel || "Creating…"}
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" /> Create free short link
                </>
              )}
            </button>
          )}
          <p className="text-center text-xs text-gray-400 dark:text-white/30">
            Random codes are free. Leave the custom field empty for an automatic code.
          </p>
        </div>

        {created && (
          <div className="bg-sky-500/10 border border-sky-400/30 rounded-2xl p-5 space-y-3">
            <p className="text-xs font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wide">
              Your short link
            </p>
            <p className="font-mono text-lg font-semibold break-all text-sky-700 dark:text-sky-300">
              {created.shortUrl}
            </p>
            <p className="text-xs text-gray-500 dark:text-white/40 truncate" title={created.targetUrl}>
              → {created.targetUrl}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void copy(created.shortUrl)}
                className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl px-4 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5 text-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy
                  </>
                )}
              </button>
              <a
                href={created.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 transition hover:bg-black/10 dark:hover:bg-white/15 flex items-center"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60">
              Recent on this device
            </h2>
            {history.map((h) => (
              <div
                key={h.code}
                className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium truncate">
                    {h.shortUrl || absoluteShortUrl(h.code)}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/30 truncate">
                    {h.title ? `${h.title} · ` : ""}
                    {h.targetUrl}
                  </p>
                </div>
                <button
                  onClick={() => void copy(h.shortUrl || absoluteShortUrl(h.code))}
                  className="text-xs text-gray-500 dark:text-white/50 hover:text-sky-500 transition cursor-pointer flex items-center gap-1"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </LinkShell>
  );
}

function payUrlPreview(payUrl: string): string {
  if (payUrl.length <= 72) return payUrl;
  return `${payUrl.slice(0, 36)}…${payUrl.slice(-28)}`;
}
