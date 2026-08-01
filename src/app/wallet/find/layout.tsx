import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Find wallet — sol.new",
  description:
    "Match passkeys to Solana addresses when you have many wallets. Reveal address and balance, rename, and pin the right one.",
  path: "/wallet/find",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
