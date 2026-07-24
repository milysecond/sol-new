"use client";

import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { CircleCheck, Minus } from "lucide-react";

type Cell = boolean | "partial" | string;

const ROWS: { feature: string; sol: Cell; pump: Cell; bags: Cell; bonk: Cell }[] = [
  { feature: "Passkey login (no seed phrase)", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Launch a token", sol: true, pump: true, bags: true, bonk: true },
  { feature: "Browse recent / top tokens", sol: true, pump: true, bags: "partial", bonk: "partial" },
  { feature: "Mint NFTs (standard + compressed)", sol: true, pump: false, bags: false, bonk: false },
  { feature: "NFT lookup by .sol / .bonk / .skr", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Multisig wallets", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Portfolio by address or name", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Send / pay / split / gift", sol: true, pump: false, bags: "partial", bonk: false },
  { feature: "Native SOL staking", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Liquid staking (LSTs)", sol: true, pump: false, bags: false, bonk: false },
  { feature: "USDC yield earn", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Fair draws / raffles", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Picks & odds board", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Mobile-native (dApp Store + PWA)", sol: true, pump: "partial", bags: "partial", bonk: "partial" },
  { feature: "No platform fee on token launch", sol: true, pump: "partial", bags: false, bonk: "partial" },
];

function Mark({ value }: { value: Cell }) {
  if (value === true)
    return <CircleCheck className="w-4 h-4 text-green-600 dark:text-green-500 inline-block" aria-label="yes" />;
  if (value === false)
    return <Minus className="w-4 h-4 text-gray-300 dark:text-white/20 inline-block" aria-label="no" />;
  if (value === "partial")
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-700 dark:text-amber-400 align-middle"
        aria-label="partial"
      >
        ~
      </span>
    );
  return <span className="text-xs">{value}</span>;
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 text-sm text-gray-700 dark:text-white/70">
        <PageTransition>
        <div className="space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            sol<span className="text-purple-500 dark:text-purple-400">.new</span>{" "}
            <span className="text-gray-400 dark:text-white/30 font-normal">vs the rest</span>
          </h1>
          <p className="text-base text-gray-500 dark:text-white/50">
            Full Solana toolkit vs specialized meme launchpads — what each is best at.
          </p>
        </header>

        <section className="rounded-2xl border border-purple-400/20 bg-purple-500/5 px-5 py-5 space-y-2">
          <div className="text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400">
            TL;DR
          </div>
          <p className="text-gray-800 dark:text-white/80 leading-relaxed">
            <span className="font-semibold text-gray-900 dark:text-white">Launchpads</span> excel at
            one flow: spin up a meme and trade it.{" "}
            <span className="font-semibold text-gray-900 dark:text-white">sol.new</span> covers the
            whole day: passkey wallet, tokens, NFTs, pay, gift, stake, earn, liquid stake, fair
            draws, and portfolio lookup by address or name.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feature comparison</h2>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5 text-xs uppercase tracking-wider text-gray-500 dark:text-white/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-3 py-3 font-medium text-center">
                    <span className="text-purple-600 dark:text-purple-400">sol.new</span>
                  </th>
                  <th className="px-3 py-3 font-medium text-center">pump.fun</th>
                  <th className="px-3 py-3 font-medium text-center">Bags</th>
                  <th className="px-3 py-3 font-medium text-center">Bonk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {ROWS.map((r) => (
                  <tr key={r.feature}>
                    <td className="px-4 py-3 text-gray-800 dark:text-white/80">{r.feature}</td>
                    <td className="px-3 py-3 text-center bg-purple-500/[0.04]">
                      <Mark value={r.sol} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Mark value={r.pump} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Mark value={r.bags} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Mark value={r.bonk} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30 leading-relaxed">
            Snapshots of public product surfaces; features change often. Prefer the product that
            matches your job, not a scoreboard.
          </p>
        </section>

        <section className="grid sm:grid-cols-3 gap-3">
          {[
            { href: "/token", label: "Launch a token" },
            { href: "/stake", label: "Stake SOL" },
            { href: "/earn", label: "Earn USDC" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 text-center text-sm font-medium text-purple-700 dark:text-purple-300 hover:border-purple-400/40 transition"
            >
              {c.label}
            </Link>
          ))}
        </section>
        </div>
        </PageTransition>
      </main>
    </div>
  );
}
