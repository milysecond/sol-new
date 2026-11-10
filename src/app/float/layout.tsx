import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Launch on Float — sol.new",
  description:
    "Launch a coin through Float's on-chain program with your sol.new passkey wallet. Pair it with an enabled quote token — stocks, SOL, or USDC.",
  path: "/float",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
