import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Stake SOL — sol.new",
  description:
    "Stake SOL to a Solana validator with your passkey wallet. Earn native staking rewards.",
  path: "/stake",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
