import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Top stonks - sol.new",
  description: "Highest market cap stonks. Full screener at stonkscreener.com.",
  path: "/stonks",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
