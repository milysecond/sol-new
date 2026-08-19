import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Get funds — sol.new",
  description:
    "Fund sol.new: Stripe A$5 credits, MoneyGram cash ↔ USDC, or receive on-chain. Passkey wallet.",
  path: "/get",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
