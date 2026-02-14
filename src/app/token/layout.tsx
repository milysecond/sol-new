import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Token — sol.new",
  description: "Launch your own token on Solana in seconds. No wallet needed, no seed phrase, low fees. Upload an image, pick a name, and go live instantly.",
  openGraph: {
    title: "Create a Token — sol.new",
    description: "Launch your own token on Solana in seconds. No wallet needed, no seed phrase, low fees.",
    url: "https://sol.new/token",
    siteName: "sol.new",
    images: [{ url: "https://sol.new/og-token.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create a Token — sol.new",
    description: "Launch your own token on Solana in seconds. No wallet, low fees.",
    images: ["https://sol.new/og-token.png"],
    creator: "@soldotnew",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
