"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CreditCard, Copy, Check, ExternalLink } from "lucide-react";
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
                      googlePay: true,
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
        <Spinner size={14} /> Loading checkout…
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

export function CrossmintFundCard() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState("staging");
  // Staging default = token checkout (FOMO path) — works in AU.
  // USDC uses Onramp product, which is geo-gated (AU often blocked on staging).
  const [asset, setAsset] = useState<"USDC" | "XMEME">("XMEME");
  const [amount, setAmount] = useState(25);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | undefined>();
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [deliveryWallet, setDeliveryWallet] = useState<string | null>(null);
  const [usedSmart, setUsedSmart] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [embedCrash, setEmbedCrash] = useState(false);

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

  const reset = useCallback(() => {
    setOrderId(null);
    setClientSecret(undefined);
    setHostedUrl(null);
    setDeliveryWallet(null);
    setUsedSmart(false);
    setPaymentStatus(null);
    setError(null);
    setEmbedCrash(false);
  }, []);

  const start = useCallback(async () => {
    if (!publicKey) return;
    if (!email.trim() || !email.includes("@")) {
      setError("Add a receipt email — required for Apple Pay / card.");
      return;
    }
    setBusy(true);
    setError(null);
    setOrderId(null);
    setClientSecret(undefined);
    setHostedUrl(null);
    setEmbedCrash(false);
    try {
      const res = await fetch("/api/crossmint/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amountUsd: amount,
          asset,
          network,
          email: email.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        orderId?: string;
        clientSecret?: string;
        deliveryWallet?: string;
        usedSmartWallet?: boolean;
        paymentStatus?: string;
        hostedCheckoutUrl?: string | null;
      };
      if (!res.ok || !data.ok || !data.orderId) {
        throw new Error(data.error || "Could not start Crossmint checkout");
      }
      if (!data.clientSecret) {
        throw new Error("Order missing clientSecret — cannot open checkout");
      }
      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);
      setDeliveryWallet(data.deliveryWallet || null);
      setUsedSmart(Boolean(data.usedSmartWallet));
      setPaymentStatus(data.paymentStatus || null);
      setHostedUrl(data.hostedCheckoutUrl || null);
    } catch (e) {
      setError(friendlyError(e, "Crossmint checkout failed."));
    } finally {
      setBusy(false);
    }
  }, [publicKey, amount, asset, network, email]);

  const kycHint = useMemo(() => {
    if (!paymentStatus) return null;
    if (paymentStatus === "requires-kyc" || paymentStatus.includes("kyc")) {
      return "Staging often needs a quick identity check in the checkout before paying.";
    }
    if (paymentStatus === "awaiting-payment") return "Complete payment in the form below.";
    return `Status: ${paymentStatus}`;
  }, [paymentStatus]);

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
        Card / Apple Pay →{" "}
        <strong className="text-gray-800 dark:text-white/80">
          {asset === "XMEME" ? "test token" : asset}
        </strong>
        {envLabel === "staging" ? " (staging / devnet)." : "."}
      </p>
      {envLabel === "staging" && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-900 dark:text-sky-100/90 leading-relaxed space-y-1">
          <p className="font-semibold">Why FOMO works in Aus · we didn’t (until now)</p>
          <p>
            <strong>FOMO</strong> uses Crossmint <em>Token Checkout</em> (buy a specific coin with
            Apple Pay) — available in almost all countries.
          </p>
          <p>
            <strong>USDC “fund wallet”</strong> uses Crossmint <em>Onramp</em> — separate product,
            IP-gated. Staging often shows “Not available in your country” from Australia.
          </p>
          <p>
            Use <strong>Test token</strong> here to verify Apple Pay (FOMO-style). For real AU
            funding until production onramp is enabled: deposit crypto, or Stripe credits below.
          </p>
        </div>
      )}
      {asset === "USDC" && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100/90 leading-relaxed">
          USDC = Onramp. If you see “Not available in your country”, that’s Crossmint geo — switch
          to <strong>Test token</strong> or fund via crypto transfer.
        </div>
      )}

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
                className={`flex-1 min-h-[44px] rounded-xl text-xs font-semibold border transition touch-manipulation active:scale-[0.98] ${
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
            placeholder="Receipt email (required)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <ActionButton
            state={busy ? "loading" : "idle"}
            idleLabel={`Buy $${amount} ${asset === "XMEME" ? "test token" : asset}`}
            loadingLabel="Creating order…"
            disabled={!publicKey || busy}
            onClick={() => void start()}
          />
        </>
      )}

      {orderId && clientSecret && (
        <div className="space-y-3">
          {kycHint && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
              {kycHint}
            </p>
          )}

          {usedSmart && deliveryWallet && (
            <div className="rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-2 text-[11px] text-gray-600 dark:text-white/60 space-y-1">
              <p>
                USDC lands in your <strong>Crossmint smart wallet</strong> (passkey is admin):
              </p>
              <button
                type="button"
                className="font-mono text-sky-600 dark:text-sky-300 break-all text-left inline-flex items-start gap-1 touch-manipulation"
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

          {CLIENT_KEY && !embedCrash && (
            <EmbedBoundary onError={() => setEmbedCrash(true)}>
              <EmbeddedCheckout
                apiKey={CLIENT_KEY}
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
              {embedCrash || !CLIENT_KEY ? "Open checkout" : "Open checkout in new tab"}{" "}
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
        Connected:{" "}
        <span className="font-mono">
          {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "—"}
        </span>
      </p>
    </div>
  );
}
