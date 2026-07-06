import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Directory — sol.new",
  description: "Everything on sol.new, on one page.",
};

// ─── The directory ────────────────────────────────────────────────────────────
// Add new links here — one line each. `href` starting with http = external (↗).

const DIRECTORY: { section: string; links: { label: string; href: string }[] }[] = [
  {
    section: "create",
    links: [
      { label: "launch a token", href: "/token" },
      { label: "mint an NFT", href: "/nft" },
      { label: "get a .sol name", href: "/id" },
      { label: "start a multisig", href: "/multisig" },
      { label: "pods", href: "/pods" },
    ],
  },
  {
    section: "money",
    links: [
      { label: "send a gift link", href: "/gift" },
      { label: "claim a gift", href: "/claim" },
      { label: "pay someone", href: "/pay" },
      { label: "split a bill", href: "/split" },
      { label: "get SOL", href: "/get" },
      { label: "your wallet", href: "/wallet" },
      { label: "portfolio", href: "/portfolio" },
    ],
  },
  {
    section: "world cup",
    links: [
      { label: "punt — live odds & picks", href: "/punt" },
    ],
  },
  {
    section: "explore",
    links: [
      { label: "token gallery", href: "/gallery" },
      { label: "live launches", href: "/launch" },
      { label: "compare tokens", href: "/compare" },
      { label: "track a wallet", href: "/track" },
      { label: "scan anything", href: "/scan" },
      { label: "sign a message", href: "/message" },
      { label: "news", href: "/news" },
    ],
  },
  {
    section: "buy NFTs",
    links: [
      { label: "magic eden", href: "https://magiceden.io/solana" },
      { label: "tensor", href: "https://www.tensor.trade" },
    ],
  },
  {
    section: "launchpads we speak",
    links: [
      { label: "pump.fun", href: "https://pump.fun" },
      { label: "bags", href: "https://bags.fm" },
      { label: "meteora", href: "https://meteora.ag" },
      { label: "metadao", href: "https://metadao.fi" },
      { label: "bonk.fun", href: "https://letsbonk.fun" },
      { label: "star.fun", href: "https://star.fun" },
      { label: "daos.fun", href: "https://daos.fun" },
      { label: "boop.fun", href: "https://boop.fun" },
      { label: "believe", href: "https://believe.app" },
      { label: "jup studio", href: "https://jup.ag/studio" },
    ],
  },
  {
    section: "stocks",
    links: [
      { label: "xstocks", href: "https://xstocks.com" },
      { label: "prestocks", href: "https://prestocks.com" },
      { label: "ondo", href: "https://ondo.finance" },
      { label: "stocks on solana", href: "https://stocksonsolana.com" },
      { label: "backpack exchange", href: "https://backpack.exchange/signup?referral=downunder" },
      { label: "sunrise", href: "https://sunrise.xyz" },
    ],
  },
  {
    section: "wallets",
    links: [
      { label: "phantom", href: "https://phantom.com" },
      { label: "solflare", href: "https://solflare.com" },
      { label: "backpack", href: "https://backpack.app" },
      { label: "ledger (hardware)", href: "https://www.ledger.com" },
    ],
  },
  {
    section: "exchanges",
    links: [
      { label: "coinbase", href: "https://www.coinbase.com" },
      { label: "binance", href: "https://www.binance.com" },
      { label: "kraken", href: "https://www.kraken.com" },
      { label: "jupiter (onchain)", href: "https://jup.ag" },
    ],
  },
  {
    section: "protocols",
    links: [
      { label: "squads — multisig", href: "https://squads.so" },
      { label: "sns — .sol names", href: "https://sns.id" },
      { label: "streamflow — vesting", href: "https://streamflow.finance" },
      { label: "raydium — swaps", href: "https://raydium.io" },
      { label: "marinade — staking", href: "https://marinade.finance" },
      { label: "jito — staking", href: "https://www.jito.network" },
      { label: "kamino — lending", href: "https://kamino.finance" },
    ],
  },
  {
    section: "explorers & data",
    links: [
      { label: "solscan", href: "https://solscan.io" },
      { label: "solana explorer", href: "https://explorer.solana.com" },
      { label: "dexscreener", href: "https://dexscreener.com/solana" },
      { label: "birdeye", href: "https://birdeye.so" },
      { label: "coingecko", href: "https://www.coingecko.com" },
    ],
  },
  {
    section: "learn",
    links: [
      { label: "solana.com", href: "https://solana.com" },
    ],
  },
  {
    section: "help & info",
    links: [
      { label: "docs", href: "/docs" },
      { label: "what's new", href: "/whats-new" },
      { label: "home", href: "/home" },
      { label: "privacy", href: "/privacy" },
      { label: "terms", href: "/terms" },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────────

const linkClass =
  "text-[13px] leading-snug text-blue-700 visited:text-purple-700 dark:text-blue-400 dark:visited:text-purple-400 hover:underline";

export default function DirPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold tracking-tight">sol.new directory</h1>
            <p className="text-xs text-gray-500 dark:text-white/40">
              everything on sol.new, one boring page — new links added all the time
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-6">
            {DIRECTORY.map(({ section, links }) => (
              <section key={section}>
                <h2 className="text-[13px] font-bold text-gray-900 dark:text-white mb-1.5">
                  {section}
                </h2>
                <ul className="space-y-1">
                  {links.map(({ label, href }) =>
                    href.startsWith("http") ? (
                      <li key={href}>
                        <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                          {label} <span aria-hidden="true">↗</span>
                        </a>
                      </li>
                    ) : (
                      <li key={href}>
                        <Link href={href} className={linkClass}>
                          {label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 dark:text-white/30 border-t border-black/10 dark:border-white/10 pt-3">
            missing something? it probably shipped last night — check{" "}
            <Link href="/whats-new" className="text-blue-700 dark:text-blue-400 hover:underline">
              what&apos;s new
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
