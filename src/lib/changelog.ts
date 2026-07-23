/**
 * Public product changelog for sol.new.
 * Keep entries user-facing. No vendor secrets or internal infra detail.
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
    date: "2026-07-24",
    title: "Stocks screener",
    items: [
      "Browse tokenized equities at /stocks with prices, volume, liquidity, and premium to traditional quotes.",
      "Filter by provider and sector; sort by volume, change, premium, and more.",
      "Trade links open on Jupiter.",
    ],
  },
  {
    date: "2026-07-24",
    title: "NFTs, earn, burn, and polish",
    items: [
      "Browse on-chain NFTs by wallet at /nfts, with Tensor and Magic Eden links.",
      "Sort NFTs by price (listing or collection floor) and filter by type, listing status, price, and collection.",
      "Close empty token accounts and reclaim rent at /burn.",
      "Protected USDC yield at /earn (/stake redirects there).",
      "Shimmer placeholders while images load on lists, what's new, and NFT grids.",
      "Earn page copy stays product-focused with no third-party branding.",
    ],
  },
  {
    date: "2026-07-23",
    title: "Bridge USDC and paid mainnet RPC",
    items: [
      "Get USDC on mainnet via bank deposit after KYC at /get (Bridge).",
      "Mainnet uses paid Helius Fast and Flux RPC only — no free public Solana endpoints.",
      "MoonPay / Apple Pay onramp paths removed in favor of Bridge.",
    ],
  },
  {
    date: "2026-07-23",
    title: "Short links and security hardening",
    items: [
      "Create short links at /link with Turso storage and /l redirects.",
      "Custom short codes available for a 0.01 SOL fee; admin can delete links.",
      "Hardened promo funding, ground keys, push auth, and RPC secrets handling.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Names, gifts, and send",
    items: [
      "Resolve .sol / .bonk / .skr names when sending.",
      "Slide-to-send on transfers.",
      "Cancel unclaimed gifts; default currency preference.",
    ],
  },
  {
    date: "2026-07-21",
    title: "Fair Draw and receipts",
    items: [
      "Fair Draw at /draw with wheel, flip, and dice modes (and /vrf, /wheel, /flip, /dice aliases).",
      "Shareable transaction receipts at /receipt.",
      "Gift claim open-graph card polish.",
    ],
  },
  {
    date: "2026-07-20",
    title: "Magic links and mailing list",
    items: [
      "Passkey wallet magic links for email-linked open.",
      "Resend mailing list signup on the homepage.",
      "Homepage and mobile nav reorganised for money and tools.",
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
