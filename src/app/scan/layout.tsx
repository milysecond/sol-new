import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Scan Any Solana Address — sol.new",
  description:
    "Paste any Solana address to inspect a wallet, token, or program. Share as sol.new/address/<pubkey>.",
  path: "/scan",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
