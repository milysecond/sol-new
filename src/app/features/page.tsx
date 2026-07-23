import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { pageMeta } from "@/lib/seo";
import {
  Wallet,
  Coins,
  Image,
  ShieldCheck,
  HandCoins,
  Users,
  Gift,
  Link2,
  Receipt,
  Dices,
  Activity,
  List,
  Rocket,
  Newspaper,
  Headphones,
  Trophy,
  AtSign,
  MessageSquare,
  FolderOpen,
  BookOpen,
  Sparkles,
  ArrowUpRight,
  ListOrdered,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = pageMeta({
  title: "Features at a glance — sol.new",
  description:
    "Every sol.new product in one place: wallet, tokens, NFTs, pay, gift, receipt, fair draw, scan, and more.",
  path: "/features",
});

type Feature = {
  href: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  aliases?: string[];
};

type Section = {
  id: string;
  title: string;
  intro: string;
  items: Feature[];
};

const SECTIONS: Section[] = [
  {
    id: "wallet",
    title: "Wallet and identity",
    intro: "Passkey-secured Solana. No seed phrase, no install.",
    items: [
      { href: "/wallet", title: "Wallet", blurb: "Create or recover with Face ID / fingerprint.", icon: Wallet },
      { href: "/get", title: "Get SOL", blurb: "Fund your wallet (onramp / faucet by network).", icon: Coins },
      { href: "/wallet/send", title: "Send", blurb: "Transfer from your passkey wallet.", icon: ArrowUpRight },
      { href: "/portfolio", title: "Portfolio", blurb: "Balances and holdings overview.", icon: FolderOpen },
      { href: "/id", title: ".sol name", blurb: "Check and register a Solana name.", icon: AtSign },
      { href: "/message", title: "Sign message", blurb: "Prove wallet ownership.", icon: MessageSquare },
      { href: "/magic", title: "Magic link", blurb: "Email-linked open for passkey wallets.", icon: Sparkles },
    ],
  },
  {
    id: "create",
    title: "Create",
    intro: "Ship tokens, NFTs, and shared wallets in minutes.",
    items: [
      { href: "/token", title: "Token", blurb: "Launch an SPL token with a bonding curve.", icon: Coins },
      { href: "/nft", title: "NFT", blurb: "Image to NFT - standard or compressed.", icon: Image },
      { href: "/multisig", title: "Multisig", blurb: "Shared wallet with multiple signers.", icon: ShieldCheck },
      { href: "/launch", title: "Live launches", blurb: "Browse recent token launches.", icon: Rocket },
    ],
  },
  {
    id: "money",
    title: "Money and links",
    intro: "Request, split, gift, and prove payments.",
    items: [
      { href: "/pay", title: "Pay", blurb: "Solana Pay link or QR in SOL or USDC.", icon: HandCoins },
      { href: "/split", title: "Split", blurb: "Split a bill and track who paid.", icon: Users },
      { href: "/gift", title: "Gift", blurb: "Send SOL or USDC as a claimable link.", icon: Gift },
      { href: "/claim", title: "Claim gift", blurb: "Open a gift link and claim with Face ID.", icon: Gift },
      { href: "/link", title: "Short links", blurb: "Create sol.new/l/… short URLs. Custom codes 0.01 SOL.", icon: Link2 },
      { href: "/receipt", title: "Receipt", blurb: "Beautiful shareable tx receipt from a signature.", icon: Receipt },
    ],
  },
  {
    id: "draw",
    title: "Fair Draw",
    intro: "Wheel, coin, dice. One free try per mode, then connect.",
    items: [
      {
        href: "/draw",
        title: "Fair Draw",
        blurb: "Provably fair picks with duration, sound, and history.",
        icon: Dices,
        aliases: ["/wheel", "/flip", "/dice", "/vrf"],
      },
      { href: "/wheel", title: "Wheel", blurb: "Shortcut into wheel mode.", icon: ListOrdered },
      { href: "/flip", title: "Flip", blurb: "Shortcut into coin flip.", icon: Coins },
      { href: "/dice", title: "Dice", blurb: "Shortcut into dice roll.", icon: Dices },
    ],
  },
  {
    id: "explore",
    title: "Explore",
    intro: "Look up anything, track launches, stay informed.",
    items: [
      { href: "/scan", title: "Scan", blurb: "Wallet, token, or program lookup.", icon: Activity },
      { href: "/lists", title: "Lists", blurb: "Watchlists and quotes.", icon: List },
      { href: "/gallery", title: "Gallery", blurb: "Token gallery.", icon: Image },
      { href: "/compare", title: "Compare", blurb: "Side-by-side token compare.", icon: List },
      { href: "/news", title: "News", blurb: "Crypto headlines.", icon: Newspaper },
      { href: "/pods", title: "Pods", blurb: "Crypto podcasts.", icon: Headphones },
      { href: "/punt", title: "Punt", blurb: "Odds and free-to-play picks.", icon: Trophy },
      { href: "/whats-new", title: "What's new", blurb: "Recent launches on sol.new.", icon: Sparkles },
    ],
  },
  {
    id: "meta",
    title: "Site",
    intro: "Maps, costs, and legal.",
    items: [
      { href: "/dir", title: "Directory", blurb: "Every internal and curated external link.", icon: FolderOpen },
      { href: "/docs", title: "Docs", blurb: "Costs, storage, and what we store.", icon: BookOpen },
      { href: "/features", title: "Features", blurb: "This page.", icon: Sparkles },
      { href: "/privacy", title: "Privacy", blurb: "Privacy policy.", icon: BookOpen },
      { href: "/terms", title: "Terms", blurb: "Terms of use.", icon: BookOpen },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-12 pb-safe">
        <header className="space-y-3 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">
            Product map
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Features at a glance
          </h1>
          <p className="text-gray-500 dark:text-white/45 text-base leading-relaxed">
            Everything on sol.new in one scannable list. Passkey wallets, create flows,
            payments, gifts, receipts, fair draws, and explorers.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/dir"
              className="rounded-full border border-black/10 dark:border-white/10 px-3 py-1.5 hover:border-violet-400/40 transition"
            >
              Full directory
            </Link>
            <Link
              href="/docs"
              className="rounded-full border border-black/10 dark:border-white/10 px-3 py-1.5 hover:border-violet-400/40 transition"
            >
              Costs and storage
            </Link>
          </div>
        </header>

        {/* Jump nav */}
        <nav className="flex flex-wrap gap-2 sticky top-14 z-10 py-2 bg-white/90 dark:bg-black/90 backdrop-blur">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-white/50 hover:text-violet-500 transition"
            >
              {s.title}
            </a>
          ))}
        </nav>

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="space-y-4 scroll-mt-24">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <p className="text-sm text-gray-500 dark:text-white/40 mt-1">{section.intro}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {section.items.map((item) => (
                <Link
                  key={item.href + item.title}
                  href={item.href}
                  className="group flex gap-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] hover:border-violet-400/35 p-3.5 transition active:scale-[0.99]"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm group-hover:text-violet-500 transition flex items-center gap-1">
                      {item.title}
                      <span className="text-[11px] font-mono font-normal text-gray-400 dark:text-white/30">
                        {item.href}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 leading-relaxed">
                      {item.blurb}
                    </p>
                    {item.aliases && item.aliases.length > 0 && (
                      <p className="text-[10px] text-gray-400 dark:text-white/25 mt-1 font-mono">
                        also {item.aliases.join(" · ")}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-2 text-sm text-gray-600 dark:text-white/50">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Principles</h2>
          <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
            <li>Passkey first: create without seed phrases.</li>
            <li>Shareable links for gifts, pay, receipts, and draws.</li>
            <li>Gift claim secrets live in the URL fragment; treat links as bearer cash.</li>
            <li>Fair Draw: one free try per mode on a device, then connect.</li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-white/30 pt-2">
            Repo mirror: <code className="font-mono">FEATURES.md</code>
          </p>
        </section>
      </main>
    </div>
  );
}
