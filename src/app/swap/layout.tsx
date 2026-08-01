import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Swap — sol.new",
  description:
    "Swap SOL, USDC, and any Solana token with your passkey wallet. Jupiter Ultra routing.",
  path: "/swap",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
