"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Banknote, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { ConnectGate } from "@/components/connect-gate";
import {
  ensureDocumentFocusForPasskey,
  getPasskeyKeypair,
} from "@/lib/passkey-wallet";
import { toast } from "@/lib/toast";

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

declare global {
  interface Window {
    RampsSDK?: {
      createRamps: (config: Record<string, unknown>) => RampsInstance;
    };
  }
}

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
      existing.addEventListener("error", () => reject(new Error("SDK load failed")));
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

export function MoneyGramRampsCard({ className = "" }: { className?: string }) {
  const { publicKey } = useWallet();
  const { rpc, network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState("sandbox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rampsRef = useRef<RampsInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/moneygram/session")
      .then((r) => r.json() as Promise<{ configured?: boolean; env?: string }>)
      .then((j) => {
        setConfigured(Boolean(j.configured));
        if (j.env) setEnvLabel(j.env);
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

  const signAndSendUsdc = useCallback(
    async (tx: OnChainTx): Promise<string> => {
      if (!publicKey) throw new Error("Connect wallet first");
      if (!tx.to || !tx.tokenAddress || tx.tokenDecimals == null) {
        throw new Error("Incomplete transfer payload from MoneyGram");
      }

      const connection = new Connection(rpc, "confirmed");
      const from = new PublicKey(publicKey);
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
      const { keypair } = await getPasskeyKeypair(publicKey);
      transaction.sign(keypair);

      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, maxRetries: 3 },
      );
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return signature;
    },
    [publicKey, rpc],
  );

  const openWidget = async (mode: Mode) => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      rampsRef.current?.destroy();
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

      await loadSdk(
        session.sdkUrl ||
          "https://playground.xramps.moneygram.com/sdk/index.global.js",
      );
      if (!window.RampsSDK?.createRamps) {
        throw new Error("MoneyGram SDK not available");
      }

      const widgetUrl = new URL(session.widgetUrl);
      widgetUrl.searchParams.set("mode", mode);

      const container = containerRef.current;
      if (!container) throw new Error("Missing widget container");

      const ramps = window.RampsSDK.createRamps({
        container,
        sessionToken: session.sessionToken,
        widgetUrl: widgetUrl.toString(),
        address: publicKey,
        chain: "solana",
        asset: "USDC",
        appName: "sol.new",
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
        onReady: () => setOpen(true),
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
          setOpen(false);
          try {
            ramps.destroy();
          } catch {
            /* ignore */
          }
          rampsRef.current = null;
        },
      });

      rampsRef.current = ramps;
      ramps.open();
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open MoneyGram");
    } finally {
      setBusy(false);
    }
  };

  if (configured === false) return null;
  if (configured === null) {
    return (
      <div className={`rounded-2xl border border-black/10 dark:border-white/10 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Spinner size={16} /> Checking cash ramp…
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-violet-500/5 p-5 space-y-3 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            MoneyGram Ramps · TEST
            {envLabel && envLabel !== "sandbox" ? ` · ${envLabel}` : " · sandbox"}
          </p>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Cash ↔ USDC (test only)
          </h3>
          <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">
            Sandbox MoneyGram on <strong>test network</strong> — no real cash.
            Switch to mainnet for live Stripe credits.
          </p>
          <p className="text-[11px] text-amber-600 mt-1">
            You’re on devnet · MoneyGram sandbox only
          </p>
        </div>
      </div>

      <ConnectGate action="use MoneyGram cash ramps">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || open}
            onClick={() => void openWidget("on-ramp")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 cursor-pointer"
          >
            {busy ? <Spinner size={16} /> : <ArrowDownToLine className="w-4 h-4" />}
            Cash in → USDC
          </button>
          <button
            type="button"
            disabled={busy || open}
            onClick={() => void openWidget("off-ramp")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-900 dark:text-emerald-100 font-semibold py-3 cursor-pointer"
          >
            {busy ? <Spinner size={16} /> : <ArrowUpFromLine className="w-4 h-4" />}
            USDC → cash out
          </button>
        </div>
      </ConnectGate>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div
        ref={containerRef}
        id="moneygram-ramps-widget"
        className={open ? "min-h-[480px] w-full rounded-xl overflow-hidden" : "hidden"}
      />
    </div>
  );
}
