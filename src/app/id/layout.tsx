import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solana names — .sol · .sns · .bonk · .skr",
  description: "Register .sol and look up .sol · .sns · .bonk · .skr on Solana.",
  openGraph: {
    title: "Solana names — sol.new",
    description: "Register .sol · look up .sol · .sns · .bonk · .skr. Paid in USDC.",
    url: "https://sol.new/id",
    siteName: "sol.new",
    type: "website",
    images: [{ url: "https://sol.new/og.png", width: 1200, height: 630, alt: "Solana names" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Solana names — sol.new",
    description: "Register .sol · look up .sol · .sns · .bonk · .skr.",
    creator: "@soldotnew",
    images: ["https://sol.new/og.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
