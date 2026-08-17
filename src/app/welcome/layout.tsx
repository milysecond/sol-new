import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "sol.new — Tokens, NFTs, and wallets on Solana",
  description:
    "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees. Start in seconds.",
  path: "/welcome",
});

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
