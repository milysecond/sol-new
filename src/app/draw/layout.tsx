import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Fair Draw — Provably fair raffles — sol.new",
  description:
    "Wallet raffle for 1M TOKENSHIT, plus wheel/coin/dice. Provably fair draws with shareable receipts.",
  path: "/draw",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
