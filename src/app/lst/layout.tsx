import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Liquid stake — sol.new",
  description:
    "Swap SOL for liquid staking tokens. Stay liquid while earning with your passkey wallet.",
  path: "/lst",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
