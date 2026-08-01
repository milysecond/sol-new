import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Address lookup — sol.new",
  description: "Look up any Solana wallet, token mint, or program. sol.new/address/…",
  path: "/address",
});

/** Bare /address — middleware rewrites to /scan. */
export default function AddressIndexPage() {
  return null;
}
