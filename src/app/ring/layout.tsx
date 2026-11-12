import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Ring — private balances and pay links — sol.new",
  description:
    "Confidential SOL and USDC on Helius Privacy Rings with your Face ID wallet. Amounts stay hidden; addresses stay public. Beta on mainnet.",
  path: "/ring",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
