import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Earn USDC — sol.new",
  description: "Earn protected USDC yield on Solana. Deposit and withdraw with your passkey wallet.",
  path: "/earn",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
