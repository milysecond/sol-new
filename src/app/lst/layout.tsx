import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Liquid stake (Sanctum) — sol.new",
  description:
    "Swap SOL for liquid staking tokens in the Sanctum ecosystem. Keep stake liquid with your passkey wallet.",
  path: "/lst",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
