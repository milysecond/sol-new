/**
 * Single source of truth for sol.new app navigation.
 * Used by Navbar "More" tray and home icon grid.
 * No duplicate hrefs.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeftRight,
  AtSign,
  Award,
  Coins,
  CreditCard,
  Dices,
  Droplets,
  Flame,
  FolderOpen,
  Gift,
  HandCoins,
  Image,
  Landmark,
  Layers,
  Link2,
  Newspaper,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

export type NavCategoryId =
  | "wallet"
  | "create"
  | "payments"
  | "defi"
  | "fun"
  | "tools"
  | "info";

export type NavItem = {
  href: string;
  /** Short label for grids */
  label: string;
  /** Home tile title (can match label) */
  title: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  category: NavCategoryId;
  /** Show on home rearrange grid */
  home?: boolean;
};

export const NAV_CATEGORIES: {
  id: NavCategoryId;
  title: string;
  blurb: string;
}[] = [
  { id: "wallet", title: "Wallet", blurb: "Balance, send, holdings" },
  { id: "create", title: "Create", blurb: "Mint and launch" },
  { id: "payments", title: "Payments", blurb: "Charge, request, split" },
  { id: "defi", title: "Earn & trade", blurb: "Yield, borrow, swap" },
  { id: "fun", title: "Play & social", blurb: "Gifts, drops, games" },
  { id: "tools", title: "Tools", blurb: "Links, names, utilities" },
  { id: "info", title: "Discover", blurb: "News and start here" },
];

/** Canonical list — each href appears once */
export const NAV_ITEMS: NavItem[] = [
  // Wallet
  {
    href: "/wallet",
    label: "Wallet",
    title: "Wallet",
    desc: "Get SOL, send, manage",
    icon: Wallet,
    color: "text-fuchsia-500 dark:text-fuchsia-400",
    category: "wallet",
    home: true,
  },
  {
    href: "/get",
    label: "Get funds",
    title: "Get funds",
    desc: "Deposit or buy crypto",
    icon: HandCoins,
    color: "text-emerald-600 dark:text-emerald-400",
    category: "wallet",
    home: true,
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    title: "Portfolio",
    desc: "Holdings overview",
    icon: FolderOpen,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    category: "wallet",
    home: true,
  },
  {
    href: "/multisig",
    label: "Multisig",
    title: "Multisig",
    desc: "Shared wallet",
    icon: ShieldCheck,
    color: "text-blue-600 dark:text-blue-400",
    category: "create",
    home: true,
  },

  // Create
  {
    href: "/token",
    label: "Token",
    title: "Token",
    desc: "Launch your own coin",
    icon: Coins,
    color: "text-orange-500 dark:text-orange-400",
    category: "create",
    home: true,
  },
  {
    href: "/nft",
    label: "Mint NFT",
    title: "NFT",
    desc: "Image to NFT",
    icon: Image,
    color: "text-green-600 dark:text-green-400",
    category: "create",
    home: true,
  },
  {
    href: "/nfts",
    label: "NFT gallery",
    title: "Browse NFTs",
    desc: "Your NFT gallery",
    icon: Layers,
    color: "text-emerald-600 dark:text-emerald-400",
    category: "create",
    home: true,
  },

  // Payments
  {
    href: "/pos",
    label: "POS",
    title: "POS",
    desc: "Charge with QR",
    icon: Store,
    color: "text-violet-600 dark:text-violet-400",
    category: "payments",
    home: true,
  },
  {
    href: "/pay",
    label: "Pay",
    title: "Pay",
    desc: "Request or scan QR",
    icon: CreditCard,
    color: "text-teal-600 dark:text-teal-400",
    category: "payments",
    home: true,
  },
  {
    href: "/split",
    label: "Split",
    title: "Split",
    desc: "Split a bill",
    icon: Users,
    color: "text-purple-600 dark:text-purple-400",
    category: "payments",
    home: true,
  },
  {
    href: "/receipt",
    label: "Receipt",
    title: "Receipt",
    desc: "Tx receipt",
    icon: Receipt,
    color: "text-orange-600 dark:text-orange-400",
    category: "payments",
    home: true,
  },
  {
    href: "/sub",
    label: "Subs",
    title: "Subscriptions",
    desc: "Credits & plans",
    icon: Sparkles,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    category: "payments",
    home: true,
  },

  // DeFi
  {
    href: "/swap",
    label: "Swap",
    title: "Swap",
    desc: "Trade tokens",
    icon: ArrowLeftRight,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    category: "defi",
    home: true,
  },
  {
    href: "/earn",
    label: "Earn",
    title: "Earn",
    desc: "USDC yield",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    category: "defi",
    home: true,
  },
  {
    href: "/loan",
    label: "Loan",
    title: "Loan",
    desc: "Lend & borrow",
    icon: Landmark,
    color: "text-lime-600 dark:text-lime-400",
    category: "defi",
    home: true,
  },
  {
    href: "/stake",
    label: "Stake",
    title: "Stake",
    desc: "Stake SOL",
    icon: Landmark,
    color: "text-purple-600 dark:text-purple-400",
    category: "defi",
    home: true,
  },
  {
    href: "/lst",
    label: "Liquid stake",
    title: "LST",
    desc: "Liquid stake",
    icon: Droplets,
    color: "text-cyan-600 dark:text-cyan-400",
    category: "defi",
    home: true,
  },

  // Fun
  {
    href: "/gift",
    label: "Gift",
    title: "Gift",
    desc: "Send crypto with a link",
    icon: Gift,
    color: "text-amber-500 dark:text-amber-400",
    category: "fun",
    home: true,
  },
  {
    href: "/memes",
    label: "Memes",
    title: "Memes",
    desc: "Toly, Sal & Ansem blanks",
    icon: Image,
    color: "text-pink-500 dark:text-pink-400",
    category: "fun",
    home: true,
  },
  {
    href: "/poap",
    label: "POAP",
    title: "POAP",
    desc: "Proof of attendance",
    icon: Award,
    color: "text-violet-600 dark:text-violet-400",
    category: "fun",
    home: true,
  },
  {
    href: "/punt",
    label: "Punt",
    title: "Punt",
    desc: "Odds, picks, markets",
    icon: Trophy,
    color: "text-green-600 dark:text-green-400",
    category: "fun",
    home: true,
  },
  {
    href: "/draw",
    label: "Draw",
    title: "Draw",
    desc: "Fair raffle",
    icon: Dices,
    color: "text-violet-600 dark:text-violet-400",
    category: "fun",
    home: true,
  },

  // Tools
  {
    href: "/link",
    label: "Links",
    title: "Links",
    desc: "Short links",
    icon: Link2,
    color: "text-sky-600 dark:text-sky-400",
    category: "tools",
    home: true,
  },
  {
    href: "/id",
    label: "Names",
    title: "Names",
    desc: ".sol · .sns · .bonk · .skr",
    icon: AtSign,
    color: "text-indigo-600 dark:text-indigo-400",
    category: "tools",
    home: true,
  },
  {
    href: "/explorer",
    label: "Explorer",
    title: "Explorer",
    desc: "Wallets, txs, tokens — in-app",
    icon: Activity,
    color: "text-rose-600 dark:text-rose-400",
    category: "tools",
    home: true,
  },
  {
    href: "/address",
    label: "Address",
    title: "Address",
    desc: "Look up any Solana address",
    icon: Activity,
    color: "text-rose-600 dark:text-rose-400",
    category: "tools",
    home: false,
  },
  {
    href: "/rent",
    label: "Rent",
    title: "Min rent",
    desc: "Min rent + gasless empty-account close",
    icon: Coins,
    color: "text-violet-600 dark:text-violet-400",
    category: "tools",
    home: true,
  },
  {
    href: "/burn",
    label: "Burn",
    title: "Burn",
    desc: "Reclaim rent",
    icon: Flame,
    color: "text-rose-600 dark:text-rose-400",
    category: "tools",
    home: true,
  },
  {
    href: "/lists",
    label: "Lists",
    title: "Lists",
    desc: "Watchlists",
    icon: Star,
    color: "text-amber-600 dark:text-amber-400",
    category: "tools",
    home: true,
  },

  // Info
  {
    href: "/starter",
    label: "Starter",
    title: "Starter",
    desc: "New to Solana? Start here",
    icon: Zap,
    color: "text-purple-600 dark:text-purple-400",
    category: "info",
    home: true,
  },
  {
    href: "/news",
    label: "News",
    title: "News",
    desc: "Solana news",
    icon: Newspaper,
    color: "text-slate-600 dark:text-slate-300",
    category: "info",
    home: true,
  },
  {
    href: "/whats-new",
    label: "What's new",
    title: "What's new",
    desc: "Product updates",
    icon: Sparkles,
    color: "text-orange-500 dark:text-orange-400",
    category: "info",
    home: true,
  },
  {
    href: "/traction",
    label: "Traction",
    title: "Traction",
    desc: "Daily signups (UTC)",
    icon: TrendingUp,
    color: "text-emerald-500 dark:text-emerald-400",
    category: "info",
    home: true,
  },
  {
    href: "/home",
    label: "Home",
    title: "Home",
    desc: "App home",
    icon: Zap,
    color: "text-purple-500 dark:text-purple-400",
    category: "info",
    home: false,
  },
];

export const NAV_BY_HREF = new Map(NAV_ITEMS.map((i) => [i.href, i]));

export function homeNavItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.home !== false && i.href !== "/home");
}

/** Default home order (product priority, not A–Z) */
export const HOME_DEFAULT_ORDER: string[] = [
  "/wallet",
  "/get",
  "/pos",
  "/gift",
  "/memes",
  "/token",
  "/swap",
  "/pay",
  "/sub",
  "/portfolio",
  "/nft",
  "/poap",
  "/earn",
  "/loan",
  "/stake",
  "/lst",
  "/split",
  "/punt",
  "/draw",
  "/receipt",
  "/link",
  "/id",
  "/explorer",
  "/address",
  "/burn",
  "/multisig",
  "/nfts",
  "/lists",
  "/starter",
  "/news",
  "/whats-new",
  "/traction",
];

export function sortNavAlpha(items: NavItem[]): NavItem[] {
  return [...items].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
}

export function groupNavByCategory(items: NavItem[]): {
  id: NavCategoryId;
  title: string;
  items: NavItem[];
}[] {
  const byCat = new Map<NavCategoryId, NavItem[]>();
  for (const c of NAV_CATEGORIES) byCat.set(c.id, []);
  for (const item of items) {
    const list = byCat.get(item.category);
    if (list) list.push(item);
  }
  return NAV_CATEGORIES.map((c) => ({
    id: c.id,
    title: c.title,
    items: byCat.get(c.id) || [],
  })).filter((g) => g.items.length > 0);
}

const MENU_ORDER_KEY = "sol.new.menu.order";

export function getMenuCustomOrder(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MENU_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export function setMenuCustomOrder(order: string[]) {
  try {
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(order));
    window.dispatchEvent(new CustomEvent("sol.new.menuOrder", { detail: { order } }));
  } catch {
    /* ignore */
  }
}

export function clearMenuCustomOrder() {
  try {
    localStorage.removeItem(MENU_ORDER_KEY);
    window.dispatchEvent(new CustomEvent("sol.new.menuOrder", { detail: { reset: true } }));
  } catch {
    /* ignore */
  }
}

export function applyOrder(items: NavItem[], order: string[] | null): NavItem[] {
  if (!order?.length) return items;
  const map = new Map(items.map((i) => [i.href, i]));
  const out: NavItem[] = [];
  for (const h of order) {
    const it = map.get(h);
    if (it) {
      out.push(it);
      map.delete(h);
    }
  }
  for (const it of items) {
    if (map.has(it.href)) out.push(it);
  }
  return out;
}

export function filterNav(items: NavItem[], q: string): NavItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return items;
  return items.filter(
    (i) =>
      i.label.toLowerCase().includes(s) ||
      i.title.toLowerCase().includes(s) ||
      i.desc.toLowerCase().includes(s) ||
      i.href.toLowerCase().includes(s) ||
      i.category.includes(s),
  );
}
