import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

// Redirect page — metadata rarely shown; still point canonical at /address.
export const metadata: Metadata = pageMeta({
  title: "Address lookup — sol.new",
  description:
    "Look up any Solana wallet, token mint, or program. Share as sol.new/address/<pubkey>.",
  path: "/address",
});

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
