import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Your Solana Portfolio — sol.new",
  description:
    "See your Solana tokens, NFTs, and balances in one place. Passkey-secured, no installs — everything in your wallet at a glance.",
  path: "/portfolio",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
