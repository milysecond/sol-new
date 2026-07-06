import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Track Any Solana Wallet — sol.new",
  description:
    "Paste any Solana wallet address to see its tokens, NFTs, and balances. A fast, free wallet explorer — no signup required.",
  path: "/track",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
