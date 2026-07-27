import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Solana Transaction Receipt — sol.new",
  description:
    "Look up any Solana transaction and get a clean, shareable receipt. Amount, from, to, fee, memo, and USD value. Copy a link or export as an image.",
  path: "/receipt",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
