import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Fair Draw — Provably fair raffles — sol.new",
  description:
    "Pick a fair winner from any list. Solana-blockhash entropy by default, ProofNetwork when configured, MagicBlock on-chain VRF coming next. Share a verifiable receipt.",
  path: "/vrf",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
