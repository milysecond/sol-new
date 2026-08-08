/**
 * Public product changelog for sol.new.
 * Keep entries user-facing. No vendor secrets or internal infra detail.
 * Newest first. Group related work by ship day.
 */

export type ChangelogEntry = {
  /** ISO date YYYY-MM-DD */
  date: string;
  title: string;
  items: string[];
};

/** Newest first. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-08-08",
    title: "Seeker dApp Store 1.0.1",
    items: [
      "sol.new updated on Solana Mobile / Seeker store — onboard, gifts, POAP, swap.",
    ],
  },
  {
    date: "2026-08-07",
    title: "Brand orbs + toast/push SFX",
    items: [
      "Thinking Orbs tinted to sol.new violet.",
      "Toasts play success/error/notify sounds; airdrop/claim use cha-ching.",
      "Push notifications: OS sound on + in-app chime when tab is open.",
    ],
  },
  {
    date: "2026-08-05",
    title: "App Clip GTM — full product",
    items: [
      "iPhone App Clip loads the full sol.new app (wallet, swap, gift, POAP…).",
      "New /clip landing with QR for IRL; GTM checklist in ios/Clip/GTM.md.",
    ],
  },
  {
    date: "2026-08-01",
    title: "Ask for funds",
    items: [
      "Wallet Get: share buttons to request SOL via SMS, WhatsApp, Telegram, X DM, or system share.",
    ],
  },
  {
    date: "2026-08-01",
    title: "Onboard is home",
    items: [
      "sol.new/ opens the onboarding flow by default. Full app grid lives at /home.",
    ],
  },
  {
    date: "2026-08-01",
    title: "Onboarding",
    items: [
      "New /onboard: value first, one goal, Face ID wallet, then a personal next step.",
      "Home “Get started” opens the flow instead of dumping into create.",
    ],
  },
  {
    date: "2026-08-01",
    title: "Thinking Orbs loading",
    items: [
      "All loading indicators use Thinking Orbs (orbs.jakubantalik.com).",
    ],
  },
  {
    date: "2026-08-01",
    title: "POAP on-chain image",
    items: [
      "POAP NFT art is an on-chain SVG data URI (no external image host).",
      "Optional drop photo is embedded in the SVG when small enough.",
    ],
  },
  {
    date: "2026-08-01",
    title: "POAP on-chain",
    items: [
      "Claiming a POAP mints a free compressed NFT to your passkey wallet.",
      "Metadata + explorer links; geo-lock still applies before mint.",
    ],
  },
  {
    date: "2026-08-01",
    title: "POAP venue search",
    items: [
      "Geo-lock pins by venue or address name (OpenStreetMap), not just GPS.",
    ],
  },
  {
    date: "2026-08-01",
    title: "POAP geo-lock",
    items: [
      "Optional GPS lock on POAP drops — claim only within 100m–5km of the pin.",
      "Issuer pins with “Use my location”; claimers prove they’re nearby.",
    ],
  },
  {
    date: "2026-08-01",
    title: "POAP drops",
    items: [
      "New /poap: create proof-of-attendance drops with link + QR.",
      "Collectors claim at /poap/<code> with a passkey wallet.",
    ],
  },
  {
    date: "2026-08-01",
    title: "Name service: .sol .bonk .sns .skr",
    items: [
      "Send, portfolio, and NFT lookup resolve .sol, .bonk, .sns, and .skr.",
      ".sol via Bonfida; .bonk/.skr via AllDomains; .sns = SNS (ANS or .sol alias).",
    ],
  },
  {
    date: "2026-08-01",
    title: "Token swap",
    items: [
      "New /swap: Jupiter Ultra routing for SOL, USDC, and any mint (passkey-signed).",
      "Balance presets, token search, live quotes.",
    ],
  },
  {
    date: "2026-07-30",
    title: "Docs, gift API, loan",
    items: [
      "POST /api/gift/create for gift funding txs; /gift uses it.",
      "/loan lend & borrow with WSOL wrap, balance slider.",
      "Updated README, FEATURES, docs, llms.txt + llms-full.txt.",
    ],
  },
  {
    date: "2026-07-30",
    title: "Lend & borrow",
    items: [
      "New /loan: supply assets to earn yield or borrow against collateral (passkey-signed).",
      "Live rates, positions, deposit/withdraw, and borrow/repay flows.",
    ],
  },
  {
    date: "2026-07-29",
    title: "Usernames and short link pay",
    items: [
      "Claim a unique @username per wallet at /creator/edit — public at sol.new/u/name.",
      "Custom short links: pay with Solana Pay QR or connected wallet; canonical URLs are sol.new/link/…",
    ],
  },
  {
    date: "2026-07-24",
    title: "Apple Pay and card onramp",
    items: [
      "Buy SOL or USDC on /get via Transak (Apple Pay / card, including Australia AUD).",
      "Stripe Crypto Onramp still available for US and EU buyers.",
      "Funds go to your passkey wallet on Solana. KYC is handled by the onramp.",
      "Bridge bank deposit remains available for ACH/wire (usually lower fee, slower).",
    ],
  },
  {
    date: "2026-07-24",
    title: "Bricolage Grotesque typeface",
    items: [
      "Default UI font is now Bricolage Grotesque across the app.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Stocks screener and brand polish",
    items: [
      "New /stocks screener for tokenized equities on Solana (xStocks, Ondo, PreStocks, Backpack, and more).",
      "Filter by provider and sector; sort by volume, 24h change, premium to traditional quotes, liquidity, and market cap.",
      "Trade links open on Jupiter.",
      "Open Graph previews redesigned: dark brand cards instead of pastel placeholders.",
      "Public changelog page and site-wide footer link.",
    ],
  },
  {
    date: "2026-07-24",
    title: "NFTs, earn, and rent reclaim",
    items: [
      "Browse on-chain NFTs by wallet at /nfts with Tensor and Magic Eden links.",
      "Sort NFTs by price (listing or collection floor).",
      "Filter by name/mint, type (compressed or standard), listing status, price, and collection.",
      "Close empty token accounts and reclaim SOL rent at /burn.",
      "Protected USDC yield at /earn. Passkey deposit and withdraw.",
      "Shimmer placeholders while images load on lists, what's new, and NFT grids.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Stake, LST, and product polish",
    items: [
      "/earn USDC yield, /stake native SOL, /lst liquid stake — no protocol branding in UI.",
      "Portfolio and NFT lookup by address, .sol, .bonk, or .skr.",
      "Punt filters TXODDS, Polymarket, Kalshi; link to punt.fun.",
      "Homepage tools grid cleaned up for phone and iPad.",
    ],
  },
  {
    date: "2026-07-23",
    title: "USDC onramp, short links, and Fair Draw",
    items: [
      "Get USDC on mainnet via bank deposit after KYC at /get.",
      "Mainnet RPC uses paid Helius Fast and Flux only (no free public Solana endpoints).",
      "Short links at /link with /l redirects; custom codes for 0.01 SOL; admin delete.",
      "Resolve .sol, .bonk, and .skr names when sending.",
      "Slide-to-send on transfers; cancel unclaimed gifts; default currency preference.",
      "Fair Draw at /draw with wheel, coin, and dice (aliases /vrf, /wheel, /flip, /dice).",
      "Draw history, sound effects, and shareable results.",
      "Security hardening for promo funding, ground keys, push auth, and secrets.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Transaction receipts and SEO",
    items: [
      "Shareable Solana transaction receipts at /receipt.",
      "Fixed www routing, dead-path redirects, and sitemap hygiene for search indexing.",
      "Stopped forcing homepage canonical on every route.",
    ],
  },
  {
    date: "2026-07-19",
    title: "Magic links and mailing list",
    items: [
      "Passkey wallet magic links for email-linked open.",
      "Mailing list signup on the homepage.",
      "Homepage and mobile nav reorganised: Gift and Punt on the main grid; tools tray for Pay, News, and more.",
    ],
  },
  {
    date: "2026-07-07",
    title: "Navigation refresh",
    items: [
      "Wallet and Punt on the phone bottom bar.",
      "More tray groups money, create, and tools.",
      "Homepage product order updated for clarity.",
    ],
  },
  {
    date: "2026-07-06",
    title: "Airdrop reliability and directory",
    items: [
      "Devnet airdrop more reliable under Workers (polling confirms, finalized blockhash).",
      "UI icons standardized (Lucide); cleaner share titles.",
      "More launchpads listed on /dir (star.fun, daos.fun, boop.fun, believe, jup studio).",
      "Memo program fix on /message.",
    ],
  },
  {
    date: "2026-05-25",
    title: "Cloudflare production cutover",
    items: [
      "sol.new serves from Cloudflare Workers with a custom domain.",
      "App hosted via OpenNext for Cloudflare.",
    ],
  },
  {
    date: "2026-05-24",
    title: "Onramp and mobile foundations",
    items: [
      "USDC purchase flow scaffolding and card payment path.",
      "Sponsored path to convert USDC to SOL after purchase.",
      "iOS app wrapper work and Apple Pay domain verification.",
      "Re-engagement cron scaffolding.",
    ],
  },
  {
    date: "2026-05-12",
    title: "Promo codes, push, and admin",
    items: [
      "Promo codes for funded product actions.",
      "Web push notifications.",
      "Admin panel for operational controls.",
    ],
  },
  {
    date: "2026-05-11",
    title: "Dark mode and iOS passkeys",
    items: [
      "Default to dark mode.",
      "Apple App Site Association for webcredentials and applinks (passkey support).",
      "Suppress PWA install prompt inside the native app wrapper.",
    ],
  },
  {
    date: "2026-05-10",
    title: "Compare page",
    items: [
      "New /compare page: sol.new versus pump.fun, Bags, and Bonk.",
    ],
  },
  {
    date: "2026-05-08",
    title: "dApp Store, legal, and PWA",
    items: [
      "Solana dApp Store publishing scaffold and portal flow.",
      "/privacy and /terms pages.",
      "PWA install prompt for iOS and Android.",
      "Paste images from the clipboard when creating tokens and NFTs.",
    ],
  },
  {
    date: "2026-05-04",
    title: "Multisig polish and clipboard paste",
    items: [
      "Multisig tab deep-links and batch transaction fallback.",
      "Balance tab renamed to Ledger.",
      "Clipboard image paste on token and NFT create flows.",
    ],
  },
  {
    date: "2026-05-03",
    title: "Multisig suite, tokens, and what's new",
    items: [
      "Full multisig experience: create, list, and open /multisig/[address].",
      "Proposals: add member, change threshold, approve, and execute (config and ledger tabs).",
      "Cross-network fallback when a multisig lives on the other cluster.",
      "Token creator can edit metadata; clearer launch and rent estimates.",
      "Compressed NFT minting path; self-hosted image and metadata storage.",
      "/whats-new with recent launches, Live/Test filter, and network-aware home banner.",
      "/docs and live cost table.",
      "Sticky nav, mobile balance pill, on-brand 404, and Telegram product events.",
      "Platform fees for NFT and multisig route to a Squads treasury.",
    ],
  },
  {
    date: "2026-05-02",
    title: "Ops and uploads",
    items: [
      "Telegram event log for product activity.",
      "Treasury balance footer on relevant surfaces.",
      "Upload preflight checks before spending rent.",
    ],
  },
  {
    date: "2026-04-02",
    title: "Program abort tools",
    items: [
      "Emergency abort surface for upgradeable programs (/kill era tooling).",
      "Wallet-connect based emergency flows for operators.",
    ],
  },
];

export function formatChangelogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
