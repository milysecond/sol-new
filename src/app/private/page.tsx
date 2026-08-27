"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { EyeOff, Shield, ArrowRight, Gift, FlaskConical } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { useNetwork } from "@/lib/network";

const PrivateSendSheet = dynamic(
  () => import("@/components/private-send-sheet").then((m) => m.PrivateSendSheet),
  { ssr: false },
);

export default function PrivatePage() {
  const { network, toggle } = useNetwork();
  const mainnet = network === "mainnet";

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <ConnectGate action="use ZK private wallet">
          <PageTransition>
            <div className="app-shell py-6 sm:py-10 space-y-6">
              <div className="text-center lg:text-left space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-purple-500/15 text-purple-500">
                  <EyeOff className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ZK Privacy</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl">
                  Real zero-knowledge private SOL via{" "}
                  <strong className="text-gray-800 dark:text-white/80">Privacy Cash</strong>{" "}
                  (Groth16 + Light Protocol). Shield → private balance → send with no public link to
                  the recipient.
                </p>
              </div>

              {!mainnet && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 space-y-3 text-sm text-amber-900 dark:text-amber-100">
                  <p className="font-semibold flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 shrink-0" />
                    You&apos;re on devnet
                  </p>
                  <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-100/80">
                    Privacy Cash <strong>can</strong> be deployed on Solana devnet (self-hosted
                    program + your own relayer). The <strong>public</strong> pool + relayer that
                    sol.new uses (
                    <code className="text-[10px]">api3.privacycash.org</code>) is{" "}
                    <strong>mainnet-only</strong> — there is no public hosted devnet API right now.
                    SDK e2e tests also run on mainnet.
                  </p>
                  <button
                    type="button"
                    onClick={() => toggle()}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3.5 py-2 transition"
                  >
                    Switch to mainnet (live)
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {[
                  {
                    icon: Shield,
                    t: "1. Shield",
                    d: "Deposit SOL into the pool from your passkey wallet.",
                  },
                  {
                    icon: EyeOff,
                    t: "2. Hold private",
                    d: "Balance is a ZK note — not a public token account.",
                  },
                  {
                    icon: ArrowRight,
                    t: "3. Send / unshield",
                    d: "Withdraw to anyone; graph breaks from your public history.",
                  },
                ].map((s) => (
                  <div
                    key={s.t}
                    className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-2"
                  >
                    <s.icon className="w-5 h-5 text-purple-500" />
                    <p className="font-semibold">{s.t}</p>
                    <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">{s.d}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-purple-400/30 bg-purple-500/5 p-4 sm:p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-300">
                  Open private wallet
                </p>
                <PrivateSendSheet />
              </div>

              <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-2 text-sm">
                <p className="font-semibold flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-500" /> ZK gifts
                </p>
                <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
                  On{" "}
                  <Link href="/gift" className="text-purple-500 underline">
                    /gift
                  </Link>
                  , choose <strong>ZK private</strong> to fund a claim link from your shielded
                  balance — the gift is not paid directly from your public address. Mainnet SOL
                  only.
                </p>
              </div>

              <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-2 text-xs text-gray-500 dark:text-white/45 leading-relaxed">
                <p className="font-semibold text-sm text-gray-800 dark:text-white/80">
                  Devnet vs mainnet
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Hosted product</strong> (what sol.new uses): mainnet pool +{" "}
                    <code className="text-[10px]">api3.privacycash.org</code>
                  </li>
                  <li>
                    <strong>Self-host / test program</strong>: Privacy Cash docs cover{" "}
                    <code className="text-[10px]">anchor deploy --provider.cluster devnet</code> —
                    you must run your own relayer (
                    <code className="text-[10px]">NEXT_PUBLIC_RELAYER_API_URL</code> at build time)
                  </li>
                  <li>
                    No public free-for-all Privacy Cash <em>devnet API</em> was found — unlike some
                    other privacy stacks (e.g. Umbra has a documented devnet indexer)
                  </li>
                </ul>
              </div>

              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                Relayer fees on send/unshield. Not financial advice. Protocol:{" "}
                <a
                  href="https://www.privacycash.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  privacycash.org
                </a>
                . Directory:{" "}
                <a
                  href="https://www.shieldedsol.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  shieldedsol.com
                </a>
                .
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
