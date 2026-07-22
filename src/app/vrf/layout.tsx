import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Fair Draw — Provably fair raffles — sol.new",
  description:
    "Spin a wheel, flip a coin, or roll the dice. Provably fair random draws with shareable receipts. One free try of each mode.",
  path: "/vrf",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
