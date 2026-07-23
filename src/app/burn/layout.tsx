import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Burn & reclaim rent — sol.new",
  description: "Close empty token accounts and reclaim SOL rent with your passkey wallet.",
  path: "/burn",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
