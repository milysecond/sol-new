import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Scan Any Solana Address — sol.new",
  description:
    "Paste any Solana address to inspect a wallet's portfolio, a token's supply and risk profile, or a program's upgrade authority.",
  path: "/scan",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
