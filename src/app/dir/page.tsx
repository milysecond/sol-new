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
    section: "start here",
    links: [
      { label: "features at a glance", href: "/features" },
      { label: "docs and costs", href: "/docs" },
      { label: "changelog", href: "/changelog" },
      { label: "what's new", href: "/whats-new" },
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
    ],
  },
  {
    section: "money",
    links: [
      { label: "send a gift link", href: "/gift" },
      { label: "claim a gift", href: "/claim" },
      { label: "pay someone", href: "/pay" },
      { label: "split a bill", href: "/split" },
      { label: "short links", href: "/link" },
      { label: "get SOL", href: "/get" },
      { label: "earn USDC", href: "/earn" },
      { label: "reclaim rent", href: "/burn" },
      { label: "your wallet", href: "/wallet" },
      { label: "portfolio", href: "/portfolio" },
    ],
  },
  {
    section: "explore",
    links: [
      { label: "watchlists", href: "/lists" },
      { label: "stocks on solana", href: "/stocks" },
      { label: "token gallery", href: "/gallery" },
      { label: "live launches", href: "/launch" },
      { label: "compare tokens", href: "/compare" },
      { label: "track a wallet", href: "/track" },
      { label: "scan anything", href: "/scan" },
      { label: "check a receipt", href: "/receipt" },
      { label: "fair draw", href: "/draw" },
      { label: "spin the wheel", href: "/wheel" },
      { label: "flip a coin", href: "/flip" },
      { label: "roll the dice", href: "/dice" },
      { label: "sign a message", href: "/message" },
      { label: "news", href: "/news" },
    ],
  },
  {
    section: "buy NFTs",
    links: [
      { label: "browse your NFTs", href: "/nfts" },
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
      { label: "backpack exchange", href: "https://backpack.exchange/signup?referral=downunder" },
      { label: "jupiter (onchain)", href: "https://jup.ag" },
    ],
  },
  {
    section: "decentralized exchanges",
    links: [
      { label: "sunrise", href: "https://sunrise.xyz" },
      { label: "dflow", href: "https://dflow.net" },
      { label: "titan", href: "https://titan.exchange" },
      { label: "flash.trade", href: "https://flash.trade" },
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
      { label: "orb markets", href: "https://orbmarkets.io" },
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

// More projects by metasal (sol.new's builder) — source: metasal.xyz.
// sol.new, scan.sol.new, punt.fun, and stocksonsolana.com are omitted
// because they already appear in the sections above.

const METASAL_PROJECTS: { label: string; href: string }[] = [
  { label: "devrels.xyz", href: "https://devrels.xyz" },
  { label: "program watch", href: "https://programwatch.dev" },
  { label: "alldomains cli", href: "https://www.npmjs.com/package/alldomains-cli" },
  { label: "buffer2base", href: "https://buffer2base.vercel.app" },
  { label: "clawbook", href: "https://clawbook.lol" },
  { label: "fleeker.fun", href: "https://fleeker.fun" },
  { label: "free rent money", href: "https://freerent.money" },
  { label: "hackaroo.xyz", href: "https://hackaroo.xyz" },
  { label: "jup gifts", href: "https://jup.gifts" },
  { label: "jup.bar", href: "https://jup.bar" },
  { label: "lazorkit", href: "https://lazorkit.com" },
  { label: "minrent", href: "https://minrent.vercel.app" },
  { label: "myseeker.id", href: "https://myseeker.id" },
  { label: "nft mate", href: "https://nftmate.vercel.app" },
  { label: "perps on sol", href: "https://perpsonsol.com" },
  { label: "pudgy drop", href: "https://pudgydrop.vercel.app" },
  { label: "raffle", href: "https://raffle.metasal.xyz" },
  { label: "rpc check", href: "https://rpccheck.com" },
  { label: "seeker tracker", href: "https://seekertracker.com" },
  { label: "shielded sol", href: "https://www.shieldedsol.com" },
  { label: "solage", href: "https://solage.vercel.app" },
  { label: "solana icons", href: "https://solana-icons.vercel.app" },
  { label: "solana unofficial docs", href: "https://kit.metasal.xyz" },
  { label: "solanaanz", href: "https://solanaanz.org" },
  { label: "solcheap", href: "https://solcheap.vercel.app" },
  { label: "soltool (npm)", href: "https://www.npmjs.com/package/soltool" },
  { label: "stables on solana", href: "https://stablesonsolana.com" },
  { label: "token cli", href: "https://www.npmjs.com/package/token-cli" },
  { label: "everything else", href: "https://metasal.xyz" },
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

          <section className="border-t border-black/10 dark:border-white/10 pt-4">
            <h2 className="text-[13px] font-bold text-gray-900 dark:text-white mb-1.5">
              more by metasal
            </h2>
            <ul className="columns-2 sm:columns-3 md:columns-4 gap-6 space-y-1">
              {METASAL_PROJECTS.map(({ label, href }) => (
                <li key={href} className="break-inside-avoid">
                  <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {label} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

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
