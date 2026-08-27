import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import ScanPage from "@/app/scan/page";

export const metadata: Metadata = pageMeta({
  title: "Address lookup — sol.new",
  description:
    "Look up any Solana wallet, token mint, or program. Share as sol.new/address/<pubkey>.",
  path: "/address",
});

/** Bare /address — scan form with correct SEO (no rewrite to /scan). */
export default function AddressIndexPage() {
  return <ScanPage />;
}
