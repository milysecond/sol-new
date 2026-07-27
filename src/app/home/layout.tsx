import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "sol.new — Create anything on Solana",
  description:
    "Marketing splash for sol.new: tokens, NFTs, wallets, payments, stake, earn, and fair draws. Passkey-secured. No installs. No seed phrases.",
  openGraph: {
    title: "sol.new — Create anything on Solana",
    description:
      "Tokens, NFTs, wallets, payments, stake, earn, and fair draws. Face ID. Ready in seconds.",
    url: "https://sol.new/home",
    siteName: "sol.new",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "sol.new — Create anything on Solana",
    description: "Passkey Solana suite. No installs. No seed phrases.",
    creator: "@soldotnew",
  },
  alternates: { canonical: "https://sol.new/home" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
