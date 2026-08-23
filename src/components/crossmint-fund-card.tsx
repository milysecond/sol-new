"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CreditCard, Copy, Check } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Spinner } from "@/components/spinner";
import { ActionButton } from "@/components/action-button";
import { friendlyError } from "@/lib/friendly-errors";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

const CLIENT_KEY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ||
      process.env.NEXT_PUBLIC_CROSSMINT_API_KEY)) ||
  "";

const EmbeddedCheckout = dynamic(
  () =>
    import("@crossmint/client-sdk-react-ui").then((m) => {
      function Inner(props: {
        apiKey: string;
        orderId: string;
        clientSecret?: string;
      }) {
        return (
          <m.CrossmintProvider apiKey={props.apiKey}>
            <div className="min-h-[360px] w-full rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950">
              <m.CrossmintEmbeddedCheckout
                orderId={props.orderId}
                clientSecret={props.clientSecret}
                payment={{
                  crypto: { enabled: false },
                  fiat: { enabled: true },
                }}
              />
            </div>
          </m.CrossmintProvider>
        );
      }
      return Inner;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] flex items-center justify-center gap-2 text-xs text-gray-500">
        <Spinner size={14} /> Loading checkout…
      </div>
    ),
  },
);

export function CrossmintFundCard() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState("staging");
  const [asset, setAsset] = useState<"USDC" | "XMEME">("USDC");
  const [amount, setAmount] = useState(25);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | undefined>();
  const [deliveryWallet, setDeliveryWallet] = useState<string | null>(null);
  const [usedSmart, setUsedSmart] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch("/api/crossmint/order", { cache: "no-store" });
        const d = (await r.json()) as { configured?: boolean; env?: string };
        if (!c) {
          setConfigured(d.configured === true);
          if (d.env) setEnvLabel(d.env);
        }
      } catch {
        if (!c) setConfigured(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const start = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setOrderId(null);
    setClientSecret(undefined);
    try {
      const res = await fetch("/api/crossmint/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amountUsd: amount,
          asset,
          network,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        orderId?: string;
        clientSecret?: string;
        deliveryWallet?: string;
        usedSmartWallet?: boolean;
      };
      if (!res.ok || !data.ok || !data.orderId) {
        throw new Error(data.error || "Could not start Crossmint checkout");
      }
      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);
      setDeliveryWallet(data.deliveryWallet || null);
      setUsedSmart(Boolean(data.usedSmartWallet));
    } catch (e) {
      setError(friendlyError(e, "Crossmint checkout failed."));
    } finally {
      setBusy(false);
    }
  }, [publicKey, amount, asset, network, email]);

  if (configured === null) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-xs text-gray-500 flex items-center gap-2">
        <Spinner size={14} /> Checking Crossmint…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-200/90">
        Crossmint not configured (missing server key).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-4 ring-1 ring-sky-500/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <CreditCard size={16} className="text-sky-500" /> Buy crypto
        </p>
        <span className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full">
          Crossmint · {envLabel}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
        FOMO-style: Apple Pay / card →{" "}
        <strong className="text-gray-800 dark:text-white/80">{asset}</strong> on Solana.
        {envLabel === "staging" ? " Staging uses devnet tokens." : ""}
      </p>

      {!orderId && (
        <>
          <div className="flex gap-1.5">
            {(
              envLabel === "staging"
                ? (["USDC", "XMEME"] as const)
                : (["USDC"] as const)
            ).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAsset(a)}
                className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold border transition touch-manipulation active:scale-[0.98] ${
                  asset === a
                    ? "bg-sky-500/15 border-sky-400/50 text-sky-800 dark:text-sky-200"
                    : "border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                }`}
              >
                {a === "XMEME" ? "Test token" : a}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-mono border transition touch-manipulation active:scale-95 ${
                  amount === a
                    ? "bg-sky-500/20 border-sky-400/50 text-sky-800 dark:text-sky-200"
                    : "border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                }`}
              >
                ${a}
              </button>
            ))}
          </div>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Receipt email (recommended)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <ActionButton
            state={busy ? "loading" : "idle"}
            idleLabel={`Buy $${amount} ${asset === "XMEME" ? "test token" : asset}`}
            loadingLabel="Creating order…"
            disabled={!publicKey}
            onClick={() => void start()}
          />
        </>
      )}

      {orderId && (
        <div className="space-y-3">
          {usedSmart && deliveryWallet && (
            <div className="rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-2 text-[11px] text-gray-600 dark:text-white/60 space-y-1">
              <p>
                Funds land in your <strong>Crossmint smart wallet</strong> (you are admin via
                passkey):
              </p>
              <button
                type="button"
                className="font-mono text-sky-600 dark:text-sky-300 break-all text-left inline-flex items-start gap-1"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(deliveryWallet);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {deliveryWallet} {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}

          {CLIENT_KEY ? (
            <EmbeddedCheckout
              apiKey={CLIENT_KEY}
              orderId={orderId}
              clientSecret={clientSecret}
            />
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Order <span className="font-mono">{orderId}</span> created. Add{" "}
              <code className="font-mono">NEXT_PUBLIC_CROSSMINT_CLIENT_KEY</code> for embedded
              Apple Pay UI.
            </p>
          )}

          <button
            type="button"
            className="text-xs text-gray-500 underline w-full text-center py-2"
            onClick={() => {
              setOrderId(null);
              setClientSecret(undefined);
              setDeliveryWallet(null);
            }}
          >
            Cancel / new amount
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-500 dark:text-red-400 text-xs leading-relaxed">
          {error}
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-white/30 leading-snug">
        Connected:{" "}
        <span className="font-mono">
          {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "—"}
        </span>
      </p>
    </div>
  );
}
