import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Multisig Wallet — sol.new",
  description: "Create a Squads multisig wallet on Solana with passkey signers.",
  path: "/multisig",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
