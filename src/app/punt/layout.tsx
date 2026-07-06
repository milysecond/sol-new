import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "World Cup 2026 Odds, Live — sol.new",
  description:
    "Live, fair World Cup 2026 odds with de-margined probabilities — from the TXODDS oracle, cryptographically verified on Solana. No bookmaker margin, no signup.",
  path: "/punt",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
