import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Get funds — sol.new",
  description:
    "Fund sol.new: Stripe live credits (Apple Pay / card) or MoneyGram Ramps sandbox for test cash ↔ USDC. Receive on-chain anytime.",
  path: "/get",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
