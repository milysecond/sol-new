import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Solana Wallet — sol.new",
  description: "A Solana wallet secured by passkeys. No seed phrase, no browser extension. Get SOL with Apple Pay or Google Pay, send payments, and manage your tokens and NFTs.",
  openGraph: {
    title: "Your Solana Wallet — sol.new",
    description: "A Solana wallet secured by passkeys. No seed phrase, no extension needed.",
    url: "https://sol.new/wallet",
    siteName: "sol.new",
    images: [{ url: "https://sol.new/og-wallet.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your Solana Wallet — sol.new",
    description: "Solana wallet secured by passkeys. No seed phrase, no extension.",
    images: ["https://sol.new/og-wallet.png"],
    creator: "@soldotnew",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
