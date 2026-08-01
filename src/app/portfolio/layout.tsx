import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Portfolio — sol.new",
  description:
    "Token balances and Jupiter DeFi positions for any Solana wallet. Also browse tokens and NFTs you created.",
  path: "/portfolio",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
