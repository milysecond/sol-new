import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Stocks on Solana — sol.new",
  description:
    "Screener for tokenized stocks on Solana: xStocks, Ondo, and more. Prices, volume, liquidity, and premium to traditional markets.",
  path: "/stocks",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
