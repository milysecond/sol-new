import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "What's New — Latest Token Launches — sol.new",
  description:
    "See the newest tokens launched on sol.new. Browse recent Solana memecoins and projects going live in real time.",
  path: "/whats-new",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
