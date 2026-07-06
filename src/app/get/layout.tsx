import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Get SOL — Buy with Apple Pay or Google Pay — sol.new",
  description:
    "Add SOL to your wallet in seconds with Apple Pay, Google Pay, or a card. The fastest way to fund a Solana wallet — no exchange account needed.",
  path: "/get",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
