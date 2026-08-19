"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Banknote, ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { ConnectGate } from "@/components/connect-gate";
import {
  ensureDocumentFocusForPasskey,
  getPasskeyKeypair,
} from "@/lib/passkey-wallet";
import { toast } from "@/lib/toast";
import { broadcastSignedTx } from "@/lib/broadcast-tx";

type Mode = "on-ramp" | "off-ramp";

type OnChainTx = {
  to?: string;
  amount?: string | number;
  tokenAddress?: string;
  tokenDecimals?: number;
  requiredNetwork?: string;
};

type RampsInstance = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

type PendingSession = {
  mode: Mode;
  sessionToken: string;
  widgetUrl: string;
  sdkUrl: string;
};

declare global {
  interface Window {
    RampsSDK?: {
      createRamps: (config: Record<string, unknown>) => RampsInstance;
    };
  }
}

const HEADER_H = 52;

function loadSdk(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.RampsSDK?.createRamps) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-moneygram-sdk="1"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("SDK load failed")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.dataset.moneygramSdk = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load MoneyGram SDK"));
    document.head.appendChild(s);
  });
}

function parseAmountToRaw(
  amount: string | number | undefined,
  decimals: number,
): bigint {
  if (amount == null) throw new Error("Missing amount");
  if (typeof amount === "number") {
    return BigInt(Math.round(amount * 10 ** decimals));
  }
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * BigInt(10 ** decimals) + BigInt(frac || "0");
}

/**
 * MoneyGram iframe needs a real box with height:100%.
 * Their SDK also mutates container.style.height from postMessage —
 * that breaks flex/absolute hosts so taps miss list rows. We lock size.
 */
function lockWidgetBox(el: HTMLElement) {
  const h = `calc(100dvh - ${HEADER_H}px)`;
  el.style.cssText = [
    "position:relative",
    "display:block",
    "width:100%",
    `height:${h}`,
    `min-height:${h}`,
    `max-height:${h}`,
    "flex:none",
    "overflow:hidden",
    "pointer-events:auto",
    "touch-action:auto",
    "background:#000",
    "z-index:1",
  ].join(";");

  const iframe = el.querySelector("iframe");
  if (iframe instanceof HTMLIFrameElement) {
    iframe.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "border:0",
      "display:block",
      "pointer-events:auto",
      "touch-action:auto",
      "z-index:2",
    ].join(";");
    iframe.setAttribute("scrolling", "yes");
    // ensure interactive APIs
    iframe.allow = "clipboard-write; camera; geolocation; payment";
  }
}

export function MoneyGramRampsCard({ className = "" }: { className?: string }) {
  const { publicKey } = useWallet();
  const { rpc, network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState<"sandbox" | "production">("sandbox");
  const [mainnetEnabled, setMainnetEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const rampsRef = useRef<RampsInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const publicKeyRef = useRef(publicKey);
  publicKeyRef.current = publicKey;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/moneygram/session")
      .then(
        (r) =>
          r.json() as Promise<{
            configured?: boolean;
            env?: string;
            mainnetEnabled?: boolean;
            live?: boolean;
          }>,
      )
      .then((j) => {
        setConfigured(Boolean(j.configured));
        if (j.env === "production" || j.live) setEnvLabel("production");
        else setEnvLabel("sandbox");
        setMainnetEnabled(Boolean(j.mainnetEnabled || j.live));
      })
      .catch(() => setConfigured(false));
    return () => {
      try {
        rampsRef.current?.destroy();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [open]);

  const isLive = envLabel === "production";
  const allowedHere =
    network === "devnet" || (network === "mainnet" && mainnetEnabled);

  const destroyWidget = useCallback(() => {
    try {
      rampsRef.current?.close();
    } catch {
      /* ignore */
    }
    try {
      rampsRef.current?.destroy();
    } catch {
      /* ignore */
    }
    rampsRef.current = null;
    setPending(null);
    setOpen(false);
    setBusy(false);
  }, []);

  const signAndSendUsdc = useCallback(
    async (tx: OnChainTx): Promise<string> => {
      const pk = publicKeyRef.current;
      if (!pk) throw new Error("Connect wallet first");
      if (!tx.to || !tx.tokenAddress || tx.tokenDecimals == null) {
        throw new Error("Incomplete transfer payload from MoneyGram");
      }

      const connection = new Connection(rpc, "confirmed");
      const from = new PublicKey(pk);
      const to = new PublicKey(tx.to);
      const mint = new PublicKey(tx.tokenAddress);
      const decimals = Number(tx.tokenDecimals);
      const raw = parseAmountToRaw(tx.amount, decimals);

      const fromAta = getAssociatedTokenAddressSync(
        mint,
        from,
        false,
        TOKEN_PROGRAM_ID,
      );
      const toAta = getAssociatedTokenAddressSync(
        mint,
        to,
        false,
        TOKEN_PROGRAM_ID,
      );

      const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          from,
          toAta,
          to,
          mint,
          TOKEN_PROGRAM_ID,
        ),
        createTransferCheckedInstruction(
          fromAta,
          mint,
          toAta,
          from,
          raw,
          decimals,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = from;

      await ensureDocumentFocusForPasskey();
      const { keypair } = await getPasskeyKeypair(pk);
      transaction.sign(keypair);

      try {
        const signature = await broadcastSignedTx(transaction);
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return signature;
      } catch {
        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false, maxRetries: 3 },
        );
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return signature;
      }
    },
    [rpc],
  );

  // Mount SDK once portal is open + pending session ready
  useEffect(() => {
    if (!open || !pending || !publicKey) return;
    let cancelled = false;
    let mo: MutationObserver | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        setBusy(true);
        await loadSdk(pending.sdkUrl);
        if (cancelled) return;
        if (!window.RampsSDK?.createRamps) {
          throw new Error("MoneyGram SDK not available");
        }

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) throw new Error("Missing widget container");

        try {
          rampsRef.current?.destroy();
        } catch {
          /* ignore */
        }
        container.innerHTML = "";
        lockWidgetBox(container);

        // Re-lock whenever SDK mutates height (breaks hit-testing otherwise)
        mo = new MutationObserver(() => {
          lockWidgetBox(container);
        });
        mo.observe(container, {
          attributes: true,
          attributeFilter: ["style", "class"],
          childList: true,
          subtree: true,
        });
        poll = setInterval(() => lockWidgetBox(container), 500);

        const widgetUrl = new URL(pending.widgetUrl);
        widgetUrl.searchParams.set("mode", pending.mode);

        const ramps = window.RampsSDK.createRamps({
          container,
          sessionToken: pending.sessionToken,
          widgetUrl: widgetUrl.toString(),
          address: publicKey,
          chain: "solana",
          asset: "USDC",
          appName: "sol.new",
          theme: "dark",
          onSignTransaction: async (tx: OnChainTx) => {
            try {
              const sig = await signAndSendUsdc(tx);
              toast.success("USDC sent for cash-out");
              return sig;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Sign failed";
              toast.error(msg);
              throw e;
            }
          },
          onError: (err: unknown) => {
            const msg =
              typeof err === "string"
                ? err
                : err && typeof err === "object" && "message" in err
                  ? String((err as { message: unknown }).message)
                  : "Widget error";
            setError(msg);
          },
          onClose: () => {
            destroyWidget();
          },
        });

        if (cancelled) {
          try {
            ramps.destroy();
          } catch {
            /* ignore */
          }
          return;
        }

        rampsRef.current = ramps;
        ramps.open();
        // After open, force iframe hit targets again
        requestAnimationFrame(() => lockWidgetBox(container));
        setTimeout(() => lockWidgetBox(container), 50);
        setTimeout(() => lockWidgetBox(container), 300);
        setTimeout(() => lockWidgetBox(container), 1000);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to open MoneyGram");
          destroyWidget();
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      mo?.disconnect();
      if (poll) clearInterval(poll);
    };
  }, [open, pending, publicKey, signAndSendUsdc, destroyWidget]);

  const start = async (mode: Mode) => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      try {
        rampsRef.current?.destroy();
      } catch {
        /* ignore */
      }
      rampsRef.current = null;

      const res = await fetch("/api/moneygram/session", { method: "POST" });
      const session = (await res.json()) as {
        ok?: boolean;
        error?: string;
        sessionToken?: string;
        widgetUrl?: string;
        sdkUrl?: string;
      };
      if (!res.ok || !session.sessionToken || !session.widgetUrl) {
        throw new Error(session.error || "Could not start MoneyGram session");
      }

      setPending({
        mode,
        sessionToken: session.sessionToken,
        widgetUrl: session.widgetUrl,
        sdkUrl:
          session.sdkUrl ||
          (isLive
            ? "https://api.xramps.moneygram.com/sdk/index.global.js"
            : "https://playground.xramps.moneygram.com/sdk/index.global.js"),
      });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open MoneyGram");
      setBusy(false);
    }
  };

  if (configured === false) return null;
  if (!allowedHere) return null;

  if (configured === null) {
    return (
      <div
        className={`rounded-2xl border border-black/10 dark:border-white/10 p-4 ${className}`}
      >
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Spinner size={16} /> Checking MoneyGram…
        </div>
      </div>
    );
  }

  const overlay =
    mounted && open
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex flex-col bg-black"
            role="dialog"
            aria-modal="true"
            aria-label="MoneyGram Ramps"
            // Don't capture pointer events on the shell — only header + iframe box
            style={{ touchAction: "manipulation" }}
          >
            <div
              className="flex items-center justify-between gap-3 px-3 sm:px-4 bg-zinc-950 border-b border-white/10 shrink-0"
              style={{
                height: HEADER_H,
                minHeight: HEADER_H,
                paddingTop: "env(safe-area-inset-top)",
                pointerEvents: "auto",
                zIndex: 2,
              }}
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                  MoneyGram {isLive ? "Live" : "Sandbox"}
                  {pending?.mode === "on-ramp"
                    ? " · Cash in"
                    : pending?.mode === "off-ramp"
                      ? " · Cash out"
                      : ""}
                </p>
                <p className="text-xs text-white/70 truncate font-mono">
                  {publicKey
                    ? `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}`
                    : "Wallet"}
                </p>
              </div>
              <button
                type="button"
                onClick={destroyWidget}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-full bg-white/12 hover:bg-white/18 text-white text-sm font-medium shrink-0"
                aria-label="Close MoneyGram"
              >
                <X size={16} /> Close
              </button>
            </div>

            {/* Explicit viewport box — SDK iframe fills this */}
            <div
              ref={containerRef}
              id="moneygram-ramps-widget"
              style={{
                height: `calc(100dvh - ${HEADER_H}px)`,
                minHeight: `calc(100dvh - ${HEADER_H}px)`,
                maxHeight: `calc(100dvh - ${HEADER_H}px)`,
                width: "100%",
                position: "relative",
                overflow: "hidden",
                pointerEvents: "auto",
                touchAction: "auto",
                zIndex: 1,
                background: "#000",
              }}
            />

            {busy && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50"
                style={{ zIndex: 5, pointerEvents: "none" }}
              >
                <div className="flex items-center gap-2 text-white text-sm">
                  <Spinner size={18} /> Opening MoneyGram…
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={`rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-violet-500/5 p-5 space-y-3 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              MoneyGram Ramps
              {isLive ? " · Live" : " · Sandbox"}
            </p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {isLive ? "Cash ↔ USDC" : "Cash ↔ USDC (test)"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">
              Full-screen MoneyGram — tap a location to continue.
            </p>
          </div>
        </div>

        <ConnectGate action="use MoneyGram cash ramps">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || open}
              onClick={() => void start("on-ramp")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 cursor-pointer min-h-[48px]"
            >
              {busy && pending?.mode === "on-ramp" ? (
                <Spinner size={16} />
              ) : (
                <ArrowDownToLine className="w-4 h-4" />
              )}
              Cash in → USDC
            </button>
            <button
              type="button"
              disabled={busy || open}
              onClick={() => void start("off-ramp")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-900 dark:text-emerald-100 font-semibold py-3 cursor-pointer min-h-[48px]"
            >
              {busy && pending?.mode === "off-ramp" ? (
                <Spinner size={16} />
              ) : (
                <ArrowUpFromLine className="w-4 h-4" />
              )}
              USDC → cash out
            </button>
          </div>
        </ConnectGate>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
      {overlay}
    </>
  );
}
