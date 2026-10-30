"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CreditCard, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Spinner } from "@/components/spinner";
import { friendlyError } from "@/lib/friendly-errors";
import { ActionButton } from "@/components/action-button";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

const CLIENT_KEY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ||
      process.env.NEXT_PUBLIC_CROSSMINT_API_KEY)) ||
  "";

/** Lazy embed — only if client key present */
const EmbeddedPay = dynamic(
  () =>
    import("@crossmint/client-sdk-react-ui").then((m) => {
      function Pay({
        orderId,
        clientSecret,
        apiKey,
      }: {
        orderId: string;
        clientSecret?: string;
        apiKey: string;
      }) {
        return (
          <m.CrossmintProvider apiKey={apiKey}>
            <div className="min-h-[320px] rounded-xl overflow-hidden border border-black/10 dark:border-white/10">
              <m.CrossmintEmbeddedCheckout
                orderId={orderId}
                clientSecret={clientSecret}
                payment={{
                  crypto: { enabled: false },
                  fiat: { enabled: true },
                }}
              />
            </div>
          </m.CrossmintProvider>
        );
      }
      return Pay;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[200px] flex items-center justify-center text-xs text-gray-500 gap-2">
        <Spinner size={14} /> Loading checkout…
      </div>
    ),
  },
);

/**
 * FOMO-style: card / Apple Pay → USDC or SOL into connected wallet via Crossmint.
 */
export function CrossmintFundCard() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState("production");
  const [asset, setAsset] = useState<"USDC" | "SOL">("USDC");
  const [amount, setAmount] = useState<number>(25);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | undefined>();
  const [payUrl, setPayUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/crossmint/order", { cache: "no-store" });
        const d = (await r.json()) as { configured?: boolean; env?: string };
        if (!cancelled) {
          setConfigured(d.configured === true);
          if (d.env) setEnvLabel(d.env);
        }
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canEmbed = Boolean(CLIENT_KEY && orderId);

  const start = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setOrderId(null);
    setClientSecret(undefined);
    setPayUrl(null);
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
        checkoutUrl?: string;
        payUrl?: string;
        clientSecret?: string;
      };
      if (!res.ok || !data.ok || !data.orderId) {
        throw new Error(data.error || "Could not start Crossmint checkout");
      }
      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);

      if (CLIENT_KEY && data.orderId) {
        // Embedded checkout mounts below
        setBusy(false);
        return;
      }

      const url = data.checkoutUrl || data.payUrl;
      if (url) {
        setPayUrl(url);
        window.location.assign(url);
        return;
      }

      throw new Error(
        "Order created. Add NEXT_PUBLIC_CROSSMINT_CLIENT_KEY for in-app checkout, or complete payment in Crossmint console.",
      );
    } catch (e) {
      setError(friendlyError(e, "Crossmint checkout failed."));
      setBusy(false);
    }
  }, [publicKey, amount, asset, network, email]);

  const summary = useMemo(
    () => `Buy $${amount} ${asset}`,
    [amount, asset],
  );

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
        <p className="font-semibold">Crossmint not configured</p>
        <p className="opacity-90 leading-relaxed">
          Add Worker secret <code className="font-mono">CROSSMINT_API_KEY</code> (
          server <code className="font-mono">sk_…</code>
          ). Optional: <code className="font-mono">NEXT_PUBLIC_CROSSMINT_CLIENT_KEY</code> (
          <code className="font-mono">ck_…</code>) for embedded Apple Pay.
        </p>
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
        FOMO-style: Apple Pay / card → <strong className="text-gray-800 dark:text-white/80">{asset}</strong>{" "}
        lands in your wallet on Solana. Real on-chain funds — not app credits.
      </p>

      {!orderId && (
        <>
          <div className="flex gap-1.5">
            {(["USDC", "SOL"] as const).map((a) => (
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
                {a}
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
            placeholder="Receipt email (recommended for Apple Pay)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />

          <ActionButton
            state={busy ? "loading" : "idle"}
            idleLabel={summary}
            loadingLabel="Creating order…"
            disabled={!publicKey}
            onClick={() => void start()}
          />
        </>
      )}

      {canEmbed && orderId && CLIENT_KEY && (
        <div className="space-y-2">
          <EmbeddedPay orderId={orderId} clientSecret={clientSecret} apiKey={CLIENT_KEY} />
          <button
            type="button"
            className="text-xs text-gray-500 underline"
            onClick={() => {
              setOrderId(null);
              setClientSecret(undefined);
            }}
          >
            Cancel / change amount
          </button>
        </div>
      )}

      {orderId && !canEmbed && (
        <p className="text-[11px] text-gray-400 font-mono break-all">
          Order {orderId}
          {payUrl && (
            <a
              href={payUrl}
              className="ml-2 text-sky-500 underline inline-flex items-center gap-0.5"
            >
              Continue pay <ExternalLink size={10} />
            </a>
          )}
        </p>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-500 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-white/30 leading-snug">
        Powered by Crossmint →{" "}
        <span className="font-mono">
          {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "wallet"}
        </span>
        . {envLabel === "staging" ? "Staging delivers devnet tokens." : "Mainnet production."}
      </p>
    </div>
  );
}
