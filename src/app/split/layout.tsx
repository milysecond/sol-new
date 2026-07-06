import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Split a Bill on Solana — sol.new",
  description:
    "Split any bill or invoice with friends and get paid in SOL or USDC. Add a tip, set the number of people, and share a payment link or QR. No app, no signup.",
  path: "/split",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
