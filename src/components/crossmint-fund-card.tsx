"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CreditCard } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Spinner } from "@/components/spinner";
import { ActionButton } from "@/components/action-button";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

const CLIENT_KEY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY ||
      process.env.NEXT_PUBLIC_CROSSMINT_API_KEY)) ||
  "";

const USDC_MAINNET = "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET = "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOL_MINT = "solana:So11111111111111111111111111111111111111112";

function locator(asset: "USDC" | "SOL", network: string, staging: boolean) {
  if (asset === "SOL") return SOL_MINT;
  if (staging || network === "devnet") return USDC_DEVNET;
  return USDC_MAINNET;
}

const EmbeddedCheckout = dynamic(
  () =>
    import("@crossmint/client-sdk-react-ui").then((m) => {
      function Inner(props: {
        apiKey: string;
        tokenLocator: string;
        amount: string;
        wallet: string;
        email?: string;
      }) {
        return (
          <m.CrossmintProvider apiKey={props.apiKey}>
            <div className="min-h-[360px] w-full rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950">
              <m.CrossmintEmbeddedCheckout
                lineItems={{
                  tokenLocator: props.tokenLocator,
                  executionParameters: {
                    mode: "exact-in",
                    amount: props.amount,
                    maxSlippageBps: "500",
                  },
                }}
                recipient={{ walletAddress: props.wallet }}
                payment={{
                  crypto: { enabled: false },
                  fiat: {
                    enabled: true,
                    ...(props.email ? { defaultReceiptEmail: props.email } : {}),
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
      <div className="min-h-[200px] flex items-center justify-center gap-2 text-xs text-gray-500">
        <Spinner size={14} /> Loading Apple Pay checkout…
      </div>
    ),
  },
);

/**
 * FOMO-style fund: card/Apple Pay → USDC/SOL to passkey wallet.
 * Prefers client-side embedded checkout (browser IP) — works when Worker
 * egress is blocked by Crossmint.
 */
export function CrossmintFundCard() {
  const { publicKey } = useWallet();
  const { network } = useNetwork();
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [envLabel, setEnvLabel] = useState("production");
  const [asset, setAsset] = useState<"USDC" | "SOL">("USDC");
  const [amount, setAmount] = useState(25);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch("/api/crossmint/order", { cache: "no-store" });
        const d = (await r.json()) as { configured?: boolean; env?: string };
        if (!c) {
          setServerOk(d.configured === true);
          if (d.env) setEnvLabel(d.env);
        }
      } catch {
        if (!c) setServerOk(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const staging = envLabel === "staging" || (CLIENT_KEY && CLIENT_KEY.includes("staging"));
  const tokenLocator = useMemo(
    () => locator(asset, network, Boolean(staging)),
    [asset, network, staging],
  );

  const hasClient = Boolean(CLIENT_KEY);
  const ready = hasClient || serverOk;

  if (serverOk === null && !CLIENT_KEY) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 text-xs text-gray-500 flex items-center gap-2">
        <Spinner size={14} /> Checking Crossmint…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-200/90 space-y-2">
        <p className="font-semibold">Crossmint needs a client key for checkout</p>
        <p className="leading-relaxed opacity-90">
          Production server key is saved, but <strong>onramp isn’t enabled</strong> on this
          Crossmint project yet (and Worker IPs may be blocked).
        </p>
        <ol className="list-decimal pl-4 space-y-1 opacity-90">
          <li>
            Console → API Keys → create <code className="font-mono">ck_production_…</code>{" "}
            (client) with orders scope
          </li>
          <li>
            Set <code className="font-mono">NEXT_PUBLIC_CROSSMINT_CLIENT_KEY</code> and redeploy
          </li>
          <li>
            Or enable production onramp:{" "}
            <a
              className="underline"
              href="https://www.crossmint.com/contact/sales"
              target="_blank"
              rel="noopener noreferrer"
            >
              crossmint.com/contact/sales
            </a>
          </li>
          <li>Or test with a <code className="font-mono">sk_staging_…</code> key first</li>
        </ol>
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
          Crossmint · {staging ? "staging" : "production"}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
        FOMO-style: Apple Pay / card →{" "}
        <strong className="text-gray-800 dark:text-white/80">{asset}</strong> lands in your
        connected wallet. Real on-chain funds.
      </p>

      {!open && (
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
            placeholder="Receipt email (recommended)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <ActionButton
            idleLabel={
              hasClient ? `Buy $${amount} ${asset}` : `Try buy $${amount} ${asset}`
            }
            disabled={!publicKey}
            onClick={() => {
              setServerError(null);
              if (hasClient) {
                setOpen(true);
                return;
              }
              // Server-side fallback
              void (async () => {
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
                    payUrl?: string;
                    checkoutUrl?: string;
                  };
                  if (!res.ok || !data.ok) {
                    setServerError(
                      data.error ||
                        "Crossmint production onramp not enabled. Add a client key (ck_…) or enable onramp with Crossmint sales.",
                    );
                    return;
                  }
                  const url = data.checkoutUrl || data.payUrl;
                  if (url) window.location.assign(url);
                  else setServerError("Order created but no checkout URL returned.");
                } catch (e) {
                  setServerError(e instanceof Error ? e.message : "Checkout failed");
                }
              })();
            }}
          />
        </>
      )}

      {open && hasClient && publicKey && (
        <div className="space-y-2">
          <EmbeddedCheckout
            apiKey={CLIENT_KEY}
            tokenLocator={tokenLocator}
            amount={String(amount)}
            wallet={publicKey}
            email={email.trim() || undefined}
          />
          <button
            type="button"
            className="text-xs text-gray-500 underline w-full text-center py-2"
            onClick={() => setOpen(false)}
          >
            Cancel / change amount
          </button>
        </div>
      )}

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-500 dark:text-red-400 text-xs leading-relaxed">
          {serverError}
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-white/30 leading-snug">
        To:{" "}
        <span className="font-mono">
          {publicKey ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}` : "connect wallet"}
        </span>
        {staging ? " · staging/devnet tokens" : " · mainnet"}
      </p>
    </div>
  );
}
