import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Browse NFTs — sol.new",
  description: "Browse Solana NFTs by wallet address. Passkey wallet or any pubkey.",
  path: "/nfts",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
