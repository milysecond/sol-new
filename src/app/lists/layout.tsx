import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Watchlists — sol.new",
  description:
    "Star your favorite Solana tokens. Multiple lists, sorted by market cap or 24h change. No seed phrase — just your passkey wallet.",
  path: "/lists",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
