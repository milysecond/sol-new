import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Get funds — USDC and SOL — sol.new",
  description:
    "Fund your sol.new wallet. Get USDC via Bridge, receive on-chain, or use the devnet faucet.",
  path: "/get",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
