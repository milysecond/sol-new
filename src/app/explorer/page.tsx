import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { ExplorerClient } from "@/components/explorer-client";

export const metadata: Metadata = pageMeta({
  title: "Explorer — sol.new",
  description:
    "In-app Solana explorer. Look up wallets, tokens, programs, and transactions on sol.new — no Solscan.",
  path: "/explorer",
});

export default function ExplorerPage() {
  return <ExplorerClient />;
}
