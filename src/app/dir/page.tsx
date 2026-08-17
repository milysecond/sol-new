import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { pageMeta } from "@/lib/seo";
import { DirQuietLandingLink } from "@/components/dir-quiet-landing-link";

export const metadata: Metadata = pageMeta({
  title: "Directory — sol.new",
  description: "Everything on sol.new, on one page. Features, create tools, wallet, and more.",
  path: "/dir",
});

// ─── Directory (deduped 2026-08) ─────────────────────────────────────────────
// In-app first. No pure-redirect aliases. No bare /claim|/receipt without ids.

const DIRECTORY: { section: string; links: { label: string; href: string }[] }[] = [
  {
    section: "start here",
    links: [
      { label: "features at a glance", href: "/features" },
      { label: "docs and costs", href: "/docs" },
      { label: "changelog", href: "/changelog" },
      { label: "what's new", href: "/whats-new" },
      { label: "app home", href: "/home" },
    ],
  },
  {
    section: "create",
    links: [
      { label: "launch a token", href: "/token" },
      { label: "mint an NFT", href: "/nft" },
      { label: "browse NFTs", href: "/nfts" },
      { label: "get a .sol name", href: "/id" },
      { label: "start a multisig", href: "/multisig" },
      { label: "pods", href: "/pods" },
      { label: "POAP drops", href: "/poap" },
    ],
  },
  {
    section: "money",
    links: [
      { label: "your wallet", href: "/wallet" },
      { label: "get funds", href: "/get" },
      { label: "send a gift link", href: "/gift" },
      { label: "pay / scan & pay", href: "/pay" },
      { label: "point of sale", href: "/pos" },
      { label: "split a bill", href: "/split" },
      { label: "subscriptions", href: "/sub" },
      { label: "short links", href: "/link" },
      { label: "find wallet", href: "/wallet/find" },
      { label: "earn USDC", href: "/earn" },
      { label: "lend & borrow", href: "/loan" },
      { label: "swap tokens", href: "/swap" },
      { label: "stake SOL", href: "/stake" },
      { label: "liquid stake", href: "/lst" },
      { label: "reclaim rent", href: "/burn" },
      { label: "portfolio", href: "/portfolio" },
    ],
  },
  {
    section: "explore",
    links: [
      { label: "address lookup", href: "/address" },
      { label: "watchlists", href: "/lists" },
      { label: "token gallery", href: "/gallery" },
      { label: "live launches", href: "/launch" },
      { label: "compare tokens", href: "/compare" },
      { label: "fair draw", href: "/draw" },
      { label: "punt odds", href: "/punt" },
      { label: "sign a message", href: "/message" },
      { label: "news", href: "/news" },
      { label: "traction", href: "/traction" },
      { label: "starter hub", href: "/starter" },
    ],
  },
  {
    section: "buy NFTs",
    links: [
      { label: "your NFTs", href: "/nfts" },
      { label: "magic eden", href: "https://magiceden.io/solana" },
      { label: "tensor", href: "https://www.tensor.trade" },
    ],
  },
  {
    section: "launchpads",
    links: [
      { label: "pump.fun", href: "https://pump.fun" },
      { label: "bags", href: "https://bags.fm" },
      { label: "meteora", href: "https://meteora.ag" },
      { label: "bonk.fun", href: "https://letsbonk.fun" },
      { label: "jup studio", href: "https://jup.ag/studio" },
    ],
  },
  {
    section: "stocks & RWAs",
    links: [
      { label: "stocks on solana (app)", href: "/stocks" },
      { label: "xstocks", href: "https://xstocks.com" },
      { label: "ondo", href: "https://ondo.finance" },
      { label: "stocksonsolana.com", href: "https://stocksonsolana.com" },
    ],
  },
  {
    section: "wallets",
    links: [
      { label: "phantom", href: "https://phantom.com" },
      { label: "solflare", href: "https://solflare.com" },
      { label: "backpack", href: "https://backpack.app" },
      { label: "ledger", href: "https://www.ledger.com" },
    ],
  },
  {
    section: "trade",
    links: [
      { label: "jupiter", href: "https://jup.ag" },
      { label: "raydium", href: "https://raydium.io" },
      { label: "backpack exchange", href: "https://backpack.exchange/signup?referral=downunder" },
      { label: "coinbase", href: "https://www.coinbase.com" },
      { label: "kraken", href: "https://www.kraken.com" },
    ],
  },
  {
    section: "protocols",
    links: [
      { label: "squads — multisig", href: "https://squads.so" },
      { label: "sns — .sol names", href: "https://sns.id" },
      { label: "marinade — staking", href: "https://marinade.finance" },
      { label: "jito — staking", href: "https://www.jito.network" },
      { label: "kamino — lending", href: "https://kamino.finance" },
      { label: "streamflow — vesting", href: "https://streamflow.finance" },
    ],
  },
  {
    section: "data",
    links: [
      { label: "dexscreener", href: "https://dexscreener.com/solana" },
      { label: "birdeye", href: "https://birdeye.so" },
      { label: "coingecko", href: "https://www.coingecko.com" },
    ],
  },
  {
    section: "help & legal",
    links: [
      { label: "docs", href: "/docs" },
      { label: "privacy", href: "/privacy" },
      { label: "terms", href: "/terms" },
      { label: "solana.com", href: "https://solana.com" },
    ],
  },
];

const METASAL_PROJECTS: { label: string; href: string }[] = [
  { label: "devrels.xyz", href: "https://devrels.xyz" },
  { label: "program watch", href: "https://programwatch.dev" },
  { label: "hackaroo.xyz", href: "https://hackaroo.xyz" },
  { label: "seeker tracker", href: "https://seekertracker.com" },
  { label: "shielded sol", href: "https://www.shieldedsol.com" },
  { label: "solanaanz", href: "https://solanaanz.org" },
  { label: "stables on solana", href: "https://stablesonsolana.com" },
  { label: "myseeker.id", href: "https://myseeker.id" },
  { label: "rpc check", href: "https://rpccheck.com" },
  { label: "everything else", href: "https://metasal.xyz" },
];

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
              everything on sol.new, one boring page — pruned for duplicates & dead aliases
            </p>
            <DirQuietLandingLink />
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
                      <li key={`${section}-${href}`}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={linkClass}
                        >
                          {label} <span aria-hidden="true">↗</span>
                        </a>
                      </li>
                    ) : (
                      <li key={`${section}-${href}`}>
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

          <section className="border-t border-black/10 dark:border-white/10 pt-4">
            <h2 className="text-[13px] font-bold text-gray-900 dark:text-white mb-1.5">
              more by metasal
            </h2>
            <ul className="columns-2 sm:columns-3 md:columns-4 gap-6 space-y-1">
              {METASAL_PROJECTS.map(({ label, href }) => (
                <li key={href} className="break-inside-avoid">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {label} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[11px] text-gray-400 dark:text-white/30 border-t border-black/10 dark:border-white/10 pt-3">
            missing something? check{" "}
            <Link href="/whats-new" className="text-blue-700 dark:text-blue-400 hover:underline">
              what&apos;s new
            </Link>
            {" · "}
            <Link href="/features" className="text-blue-700 dark:text-blue-400 hover:underline">
              features
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
