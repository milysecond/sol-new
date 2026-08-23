"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CreditCard, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Spinner } from "@/components/spinner";
import { ActionButton } from "@/components/action-button";
import { friendlyError } from "@/lib/friendly-errors";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

/** Staging test memecoin (devnet / Crossmint staging) */
const XMEME_STAGING = "7EivYFyNfgGj8xbUymR7J4LuxUHLKRzpLaERHLvi7Dgu";

function clientKeyForNetwork(network: "mainnet" | "devnet"): string {
  if (typeof process === "undefined") return "";
  if (network === "devnet") {
    return (
      process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY_STAGING ||
      process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ||
      process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ||
      ""
    );
  }
  return (
    process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY_PRODUCTION ||
    process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY_MAINNET ||
    // only use generic if not clearly staging
    (process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY?.includes("staging")
      ? ""
      : process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY) ||
    ""
  );
}

type CheckoutProps = {
  apiKey: string;
  orderId: string;
  clientSecret?: string;
  receiptEmail?: string;
};

const EmbeddedCheckout = dynamic(
  () =>
    import("@crossmint/client-sdk-react-ui").then((m) => {
      function Inner({ apiKey, orderId, clientSecret, receiptEmail }: CheckoutProps) {
        return (
          <m.CrossmintProvider apiKey={apiKey}>
            <div className="min-h-[420px] w-full rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950">
              <m.CrossmintEmbeddedCheckout
                orderId={orderId}
                clientSecret={clientSecret}
                payment={{
                  receiptEmail: receiptEmail || undefined,
                  crypto: { enabled: false },
                  fiat: {
                    enabled: true,
                    allowedMethods: {
                      card: true,
                      applePay: true,
                      googlePay: false,
                    },
                  },
                  defaultMethod: "fiat",
                }}
                appearance={{
                  variables: {
                    borderRadius: "12px",
                    colors: { accent: "#0ea5e9" },
                  },
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
      <div className="min-h-[240px] flex items-center justify-center gap-2 text-xs text-gray-500">
        <Spinner size={14} /> Loading Apple Pay checkout…
      </div>
    ),
  },
);

class EmbedBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { err: boolean }
> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.err) return null;
    return this.props.children;
  }
}

/**
 * FOMO-style Crossmint Token Checkout (Apple Pay).
 * No USDC onramp — buy a specific token mint into the connected wallet.
 */
export function CrossmintFundCard() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState(network === "devnet" ? "staging" : "production");
  const [amount, setAmount] = useState(25);
  const [email, setEmail] = useState("");
  const [tokenMint, setTokenMint] = useState(
    network === "devnet" ? XMEME_STAGING : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | undefined>();
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [tokenLocator, setTokenLocator] = useState<string | null>(null);
  const [embedCrash, setEmbedCrash] = useState(false);

  const clientKey = useMemo(() => clientKeyForNetwork(network), [network]);

  useEffect(() => {
    // Reset mint default when switching network
    setTokenMint(network === "devnet" ? XMEME_STAGING : "");
    setOrderId(null);
    setClientSecret(undefined);
    setHostedUrl(null);
    setError(null);
  }, [network]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch(`/api/crossmint/order?network=${network}`, {
          cache: "no-store",
        });
        const d = (await r.json()) as {
          networkConfigured?: boolean;
          configured?: boolean;
          env?: string;
          defaultMint?: string | null;
        };
        if (!c) {
          setConfigured(d.networkConfigured === true || d.configured === true);
          if (d.env) setEnvLabel(d.env);
          if (d.defaultMint && network === "devnet") setTokenMint(d.defaultMint);
        }
      } catch {
        if (!c) setConfigured(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [network]);

  const reset = useCallback(() => {
    setOrderId(null);
    setClientSecret(undefined);
    setHostedUrl(null);
    setTokenLocator(null);
    setError(null);
    setEmbedCrash(false);
  }, []);

  const start = useCallback(async () => {
    if (!publicKey) return;
    if (!email.trim() || !email.includes("@")) {
      setError("Receipt email required for Apple Pay.");
      return;
    }
    const mint = tokenMint.trim();
    if (!mint) {
      setError("Enter a Solana token mint for checkout.");
      return;
    }
    setBusy(true);
    setError(null);
    reset();
    setBusy(true);
    try {
      const res = await fetch("/api/crossmint/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amountUsd: amount,
          tokenMint: mint,
          network,
          email: email.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        orderId?: string;
        clientSecret?: string;
        hostedCheckoutUrl?: string | null;
        tokenLocator?: string;
      };
      if (!res.ok || !data.ok || !data.orderId) {
        throw new Error(data.error || "Could not start token checkout");
      }
      if (!data.clientSecret) {
        throw new Error("Order missing clientSecret — cannot open Apple Pay");
      }
      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);
      setHostedUrl(data.hostedCheckoutUrl || null);
      setTokenLocator(data.tokenLocator || null);
    } catch (e) {
      setError(friendlyError(e, "Token checkout failed."));
    } finally {
      setBusy(false);
    }
  }, [publicKey, email, tokenMint, amount, network, reset]);

  if (configured === null) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-xs text-gray-500 flex items-center gap-2">
        <Spinner size={14} /> Checking Crossmint…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-200/90 space-y-1">
        <p className="font-semibold">Crossmint Token Checkout not configured</p>
        <p>
          {network === "devnet"
            ? "Set staging server key sk_staging_… (CROSSMINT_API_KEY / _STAGING)."
            : "Set production server key sk_production_… (CROSSMINT_API_KEY_PRODUCTION)."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 space-y-4 ring-1 ring-sky-500/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <CreditCard size={16} className="text-sky-500" /> Buy token
        </p>
        <span className="text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full">
          Crossmint · Apple Pay · {envLabel}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
        FOMO-style <strong className="text-gray-800 dark:text-white/80">Token Checkout</strong> —
        Apple Pay / card buys a specific mint into your wallet. No USDC onramp.
      </p>

      {!orderId && (
        <>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-gray-500 dark:text-white/50">
              Token mint {network === "devnet" ? "(devnet — XMEME default)" : "(mainnet)"}
            </span>
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={
                network === "devnet"
                  ? XMEME_STAGING
                  : "Solana mint address"
              }
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value.trim())}
              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 font-mono text-xs sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`min-h-[40px] px-3 rounded-lg text-xs font-mono border transition touch-manipulation active:scale-95 ${
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
            placeholder="Receipt email (required for Apple Pay)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />

          <ActionButton
            state={busy ? "loading" : "idle"}
            idleLabel={`Buy $${amount} with Apple Pay`}
            loadingLabel="Creating checkout…"
            disabled={!publicKey || busy}
            onClick={() => void start()}
          />
        </>
      )}

      {orderId && clientSecret && (
        <div className="space-y-3">
          {tokenLocator && (
            <p className="text-[11px] text-gray-500 dark:text-white/45 font-mono break-all">
              {tokenLocator} →{" "}
              {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "wallet"}
            </p>
          )}

          {clientKey && !embedCrash && (
            <EmbedBoundary onError={() => setEmbedCrash(true)}>
              <EmbeddedCheckout
                apiKey={clientKey}
                orderId={orderId}
                clientSecret={clientSecret}
                receiptEmail={email.trim() || undefined}
              />
            </EmbedBoundary>
          )}

          {hostedUrl && (
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 text-white text-sm font-semibold px-4 touch-manipulation active:scale-[0.98]"
            >
              {embedCrash || !clientKey ? "Open Apple Pay checkout" : "Open checkout in new tab"}{" "}
              <ExternalLink size={14} />
            </a>
          )}

          <button
            type="button"
            className="text-xs text-gray-500 underline w-full text-center py-2 touch-manipulation"
            onClick={reset}
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
        Network: <span className="font-semibold">{network}</span>
        {" · "}
        Connected:{" "}
        <span className="font-mono">
          {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "—"}
        </span>
      </p>
    </div>
  );
}
