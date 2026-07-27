import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Docs & Guides — sol.new",
  description:
    "Learn how to create Solana tokens, mint NFTs, set up multisig wallets, and accept payments on sol.new. Simple guides for beginners and builders.",
  path: "/docs",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
