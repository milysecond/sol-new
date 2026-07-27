import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Crypto & Solana News — sol.new",
  description:
    "The latest Solana and crypto headlines, aggregated from top sources and refreshed continuously. Stay current on tokens, DeFi, and the wider ecosystem.",
  path: "/news",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
