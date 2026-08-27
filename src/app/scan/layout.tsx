import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Scan Any Solana Address — sol.new",
  description:
    "Paste any Solana address to inspect a wallet, token, or program. Share as sol.new/address/<pubkey>.",
  path: "/scan",
});

/** Layout kept for legacy /scan deep links before middleware 308 → /address. */
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
