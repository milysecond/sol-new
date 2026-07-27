import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Compare — sol.new vs launchpads",
  description:
    "How sol.new compares for launching tokens, minting NFTs, staking, and managing wallets on Solana.",
  path: "/compare",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
