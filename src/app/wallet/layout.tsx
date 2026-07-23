import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Your Solana Wallet — sol.new",
  description:
    "A Solana wallet secured by passkeys. Get USDC, send payments, and manage your tokens and NFTs.",
  path: "/wallet",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
