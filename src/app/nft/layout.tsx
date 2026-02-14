import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mint an NFT — sol.new",
  description: "Turn any image into an NFT on Solana. Standard or compressed, no wallet needed, no seed phrase. Upload, name it, and mint instantly.",
  openGraph: {
    title: "Mint an NFT — sol.new",
    description: "Turn any image into an NFT on Solana. Standard or compressed, no wallet needed.",
    url: "https://sol.new/nft",
    siteName: "sol.new",
    images: [{ url: "https://sol.new/og-nft.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mint an NFT — sol.new",
    description: "Turn any image into an NFT on Solana. No wallet, low fees.",
    images: ["https://sol.new/og-nft.png"],
    creator: "@soldotnew",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
