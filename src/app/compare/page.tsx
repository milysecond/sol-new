import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  KeyRound,
  Coins,
  Image as ImageIcon,
  ShieldCheck,
  Wallet,
  Smartphone,
  CircleCheck,
  Minus,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Compare — sol.new vs pump.fun, Bags, Bonk",
  description:
    "How sol.new compares to pump.fun, Bags, and Bonk for launching tokens, minting NFTs, and managing wallets on Solana.",
};

type Cell = boolean | "partial" | string;

const ROWS: { feature: string; sol: Cell; pump: Cell; bags: Cell; bonk: Cell }[] = [
  { feature: "Passkey login (no seed phrase, no extension)", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Launch a token", sol: true, pump: true, bags: true, bonk: true },
  { feature: "Mint NFTs (standard + compressed)", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Squads multisig built in", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Wallet manager + portfolio", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Send and receive (pay)", sol: true, pump: false, bags: "partial", bonk: false },
  { feature: "Mobile-native (Solana dApp Store + PWA)", sol: true, pump: "partial", bags: "partial", bonk: "partial" },
  { feature: "No platform fee on token launch", sol: true, pump: "partial", bags: false, bonk: "partial" },
  { feature: "Public cost breakdown", sol: true, pump: false, bags: false, bonk: false },
  { feature: "Open trading liquidity / token discovery", sol: "partial", pump: true, bags: true, bonk: true },
];

function Mark({ value }: { value: Cell }) {
  if (value === true)
    return <CircleCheck className="w-4 h-4 text-green-500 inline-block" aria-label="yes" />;
  if (value === false)
    return <Minus className="w-4 h-4 text-gray-300 dark:text-white/20 inline-block" aria-label="no" />;
  if (value === "partial")
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/15 text-[10px] font-bold text-amber-600 dark:text-amber-400 align-middle"
        aria-label="partial"
        title="Partial"
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
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10 text-sm text-gray-700 dark:text-white/70">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            sol<span className="text-purple-400">.new</span>{" "}
            <span className="text-gray-400 dark:text-white/30 font-normal">vs the rest</span>
          </h1>
          <p className="text-base text-gray-500 dark:text-white/50">
            Honest comparison vs pump.fun, Bags, and Bonk for what each does
            best — and where they differ.
          </p>
        </header>

        <section className="rounded-2xl border border-purple-400/20 bg-purple-500/5 px-5 py-5 space-y-2">
          <div className="text-xs uppercase tracking-wider text-purple-400">TL;DR</div>
          <p className="text-gray-800 dark:text-white/80 leading-relaxed">
            <span className="font-semibold text-gray-900 dark:text-white">pump.fun, Bags, and Bonk</span> are
            specialized meme-launch platforms — they nail a single workflow with
            heavy trading liquidity. <span className="font-semibold text-gray-900 dark:text-white">sol.new</span> is
            a full Solana toolkit: tokens, NFTs, multisigs, wallet, and payments
            in one passkey-secured app, with a public cost sheet and no platform
            fee on token launches. Pick sol.new when you want all of Solana in
            one place; pick the others when you want to ride a meme launchpad's
            existing flow and discovery.
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
                    <span className="text-purple-400">sol.new</span>
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
            <CircleCheck className="w-3 h-3 inline-block text-green-500 align-middle" /> yes ·
            <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-amber-500/15 text-[8px] font-bold text-amber-600 dark:text-amber-400 align-middle mx-1">~</span>
            partial ·
            <Minus className="w-3 h-3 inline-block text-gray-300 dark:text-white/20 align-middle" /> no.
            Competitor product surface changes often; check their sites for the
            latest.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Why sol.new</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card icon={<KeyRound className="w-5 h-5 text-purple-400" />} title="No seed phrase, no extension">
              Wallets are protected by a passkey (Face ID, Touch ID, or a
              hardware key) generated on your device. Nothing to copy down,
              nothing to install.
            </Card>
            <Card icon={<Coins className="w-5 h-5 text-orange-400" />} title="All-in-one toolkit">
              Tokens, NFTs (standard <em>and</em> compressed), Squads multisigs,
              wallet management, and payments — without leaving the app or
              switching wallets.
            </Card>
            <Card icon={<Smartphone className="w-5 h-5 text-purple-400" />} title="Mobile-native">
              Installable PWA on iOS and Android; published to the Solana dApp
              Store for Saga / Seeker. Same passkey-secured experience across
              every device.
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Costs at a glance</h2>
          <p>
            sol.new charges no platform fee on token launches — you pay only
            real on-chain rent (~0.025–0.03 SOL). NFT mints, multisig creation,
            and other costs are listed in plain numbers on the{" "}
            <Link href="/docs" className="text-purple-400 hover:underline">
              docs page
            </Link>
            , refreshed against live SOL price. Most launchpads bundle
            additional fees into the bonding curve — sometimes called creator
            fees, swap fees, or graduation fees. Read the small print before
            launching anywhere.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Where the launchpads still win
          </h2>
          <p>
            sol.new is the better tool for <em>building</em>: launching, minting,
            and managing on Solana. If your goal is purely <em>trading</em>{" "}
            existing meme tokens — riding pump.fun&apos;s candle feed, hunting
            new graduations on Bonk, or discovering Bags drops — those
            platforms have more concentrated liquidity, larger trader bases, and
            tighter integrations with Solana&apos;s sniper-bot ecosystem. Use
            them for what they&apos;re good at, then come back here when you want
            to <span className="font-medium text-gray-900 dark:text-white">create</span>{" "}
            something of your own.
          </p>
        </section>

        <section className="rounded-2xl border border-purple-400/30 bg-gradient-to-br from-purple-500/10 to-orange-500/5 px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-base font-semibold text-gray-900 dark:text-white">
              Try sol.new
            </div>
            <div className="text-xs text-gray-500 dark:text-white/40">
              Passkey wallet · no extension · ~0.03 SOL to launch a token.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/token"
              className="inline-flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <Coins className="w-4 h-4" /> Launch a token
            </Link>
            <Link
              href="/nft"
              className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <ImageIcon className="w-4 h-4" /> Mint NFT
            </Link>
            <Link
              href="/multisig"
              className="inline-flex items-center gap-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <ShieldCheck className="w-4 h-4" /> Multisig
            </Link>
            <Link
              href="/wallet"
              className="inline-flex items-center gap-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <Wallet className="w-4 h-4" /> Wallet
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-4 space-y-2 bg-white dark:bg-black/40">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/50 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
