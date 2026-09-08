"use client";

import { useState } from "react";
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
const RingsPanel = dynamic(
  () => import("./rings-panel").then((m) => m.RingsPanel),
  { ssr: false },
);

type Rail = "cash" | "rings";

export function PrivateHub() {
  const { network, toggle } = useNetwork();
  const mainnet = network === "mainnet";
  const [rail, setRail] = useState<Rail>(mainnet ? "cash" : "rings");

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <ConnectGate action="use private wallet">
          <PageTransition>
            <div className="app-shell py-6 sm:py-10 space-y-6">
              <div className="text-center lg:text-left space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-purple-500/15 text-purple-500">
                  <EyeOff className="w-6 h-6" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Private</h1>
                <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl">
                  Privacy Cash for mainnet ZK. Helius Rings for devnet confidential transfers.
                  Same page at /private, /anon, and /prv8.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRail("cash")}
                  className={`min-h-12 rounded-xl text-sm font-semibold ${
                    rail === "cash"
                      ? "bg-purple-500 text-white"
                      : "border border-black/10 dark:border-white/10"
                  }`}
                >
                  Privacy Cash
                </button>
                <button
                  type="button"
                  onClick={() => setRail("rings")}
                  className={`min-h-12 rounded-xl text-sm font-semibold ${
                    rail === "rings"
                      ? "bg-cyan-500 text-black"
                      : "border border-black/10 dark:border-white/10"
                  }`}
                >
                  Helius Rings
                </button>
              </div>

              {rail === "cash" && (
                <>
                  {!mainnet && (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 space-y-3 text-sm text-amber-900 dark:text-amber-100">
                      <p className="font-semibold flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 shrink-0" />
                        You&apos;re on devnet
                      </p>
                      <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-100/80">
                        Hosted Privacy Cash (<code className="text-[10px]">api3.privacycash.org</code>) is
                        mainnet-only. Switch to live, or use Helius Rings on test.
                      </p>
                      <button
                        type="button"
                        onClick={() => toggle()}
                        className="inline-flex items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3.5 py-2"
                      >
                        Switch to mainnet (live)
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    {[
                      { icon: Shield, t: "1. Shield", d: "Deposit SOL into the pool from your passkey wallet." },
                      { icon: EyeOff, t: "2. Hold private", d: "Balance is a ZK note, not a public token account." },
                      { icon: ArrowRight, t: "3. Send / unshield", d: "Withdraw to anyone. Graph breaks from your public history." },
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
                      balance. Mainnet SOL only.
                    </p>
                  </div>
                </>
              )}

              {rail === "rings" && (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-4 sm:p-5">
                  <RingsPanel />
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                Relayer fees on Privacy Cash send/unshield. Rings still in audit. Not financial advice.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
