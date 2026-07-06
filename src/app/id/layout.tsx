import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get your .sol Domain — sol.new",
  description: "Register your .sol domain on Solana. Paid in USDC.",
  openGraph: {
    title: "Get your .sol Domain — sol.new",
    description: "Register your .sol domain on Solana. Your identity on-chain. Paid in USDC.",
    url: "https://sol.new/id",
    siteName: "sol.new",
    type: "website",
    images: [{ url: "https://sol.new/og.png", width: 1200, height: 630, alt: "Get your .sol domain" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get your .sol Domain — sol.new",
    description: "Register your .sol domain on Solana. Paid in USDC.",
    creator: "@soldotnew",
    images: ["https://sol.new/og.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
