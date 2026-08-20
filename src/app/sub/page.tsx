"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { toast } from "@/lib/toast";

type StripeStatus = {
  charges_enabled?: boolean;
  card_payments?: string;
  error?: string;
};

export default function SubPage() {
  const { publicKey } = useWallet();
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsOk, setCreditsOk] = useState<boolean | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const [c, s] = await Promise.all([
        fetch(`/api/credits/checkout${q}`, { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/stripe/status", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setCreditsOk((c as { configured?: boolean }).configured === true);
      setCredits(Number((c as { balanceCredits?: number }).balanceCredits ?? 0));
      if (s) setStripe(s as StripeStatus);
    } catch {
      setCreditsOk(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const buyCredits = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.assign(data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  };

  const cardReady =
    stripe?.charges_enabled === true || stripe?.card_payments === "active";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 sm:flex sm:justify-center">
        <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
              Subscriptions
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Plans & credits</h1>
            <p className="text-sm text-gray-500 dark:text-white/45 leading-relaxed">
              Fiat credits (Apple Pay when Stripe is live) and on-chain USDC subscriptions
              via Solana Foundation’s subscriptions program.
            </p>
          </header>

          {/* Credits */}
          <section className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-violet-500" />
                Credits pack
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300">
                A$5 · 500 credits
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/45">
              Digital credits for sol.new (fees, vanity links, drops). Not a crypto purchase.
            </p>

            <ConnectGate action="buy credits">
              <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3">
                <span className="text-xs text-gray-500">Balance</span>
                <span className="font-bold tabular-nums">
                  {credits === null ? "…" : credits.toLocaleString()}{" "}
                  <span className="text-xs font-medium text-gray-400">credits</span>
                </span>
              </div>

              <button
                type="button"
                disabled={busy || !publicKey || creditsOk === false}
                onClick={() => void buyCredits()}
                className="w-full mt-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-xl py-3 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {busy ? <Spinner size={16} /> : null}
                Buy A$5 with Apple Pay / card
              </button>
            </ConnectGate>

            {/* Stripe readiness */}
            <div className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Stripe card payments</span>
                {stripe == null ? (
                  <span className="text-gray-400">checking…</span>
                ) : cardReady ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Live
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <CircleDashed className="w-3.5 h-3.5" /> Not enabled
                  </span>
                )}
              </div>
              {!cardReady && (
                <p className="text-[11px] text-amber-700/80 dark:text-amber-200/70 leading-relaxed">
                  Checkout needs <strong>card_payments</strong> active on the Stripe account.
                  Dashboard → Capabilities → Card payments.
                </p>
              )}
              <button
                type="button"
                onClick={() => void load()}
                className="text-[11px] text-gray-400 hover:text-violet-500 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Refresh status
              </button>
            </div>
          </section>

          {/* On-chain USDC plans */}
          <section className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              On-chain USDC plans
            </h2>
            <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
              Using{" "}
              <a
                href="https://github.com/solana-foundation/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-500 font-medium inline-flex items-center gap-0.5"
              >
                Solana Foundation subscriptions
                <ExternalLink className="w-3 h-3" />
              </a>
              : merchants publish a plan, users approve a Subscription Authority, pullers charge each
              period in USDC — no Stripe.
            </p>
            <ul className="text-xs text-gray-600 dark:text-white/55 space-y-1.5 list-disc pl-4">
              <li>
                <strong className="text-gray-800 dark:text-white/80">sol.new+</strong> — monthly USDC
                → sponsored fees + vanity links
              </li>
              <li>
                <strong className="text-gray-800 dark:text-white/80">Creator subs</strong> — fans
                subscribe to a wallet
              </li>
              <li>
                <strong className="text-gray-800 dark:text-white/80">Recurring gifts</strong> —
                allowance-style USDC
              </li>
            </ul>
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100/80">
              <Sparkles className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
              Program live at <code className="font-mono">De1egAFM…R44</code>. Next: wire create plan
              + subscribe UI + puller cron. Tracked in{" "}
              <Link href="/whats-new" className="underline">
                backlog
              </Link>
              .
            </div>
          </section>

          <section className="text-center text-xs text-gray-400 space-y-2 pb-8">
            <p>
              Also see{" "}
              <Link href="/get" className="text-violet-500 font-medium">
                /get
              </Link>{" "}
              for funding ·{" "}
              <Link href="/pos" className="text-violet-500 font-medium">
                /pos
              </Link>{" "}
              for retail charge
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
