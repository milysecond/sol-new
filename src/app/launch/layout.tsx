import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Launch a Token — sol.new",
  description: "Launch a meme coin on Solana — free creation, Raydium graduation built in.",
  openGraph: {
    title: "Launch a Token — sol.new",
    description: "Create your token on pump.fun's bonding curve — free, passkey-secured, no seed phrase.",
    url: "https://sol.new/launch",
    siteName: "sol.new",
    type: "website",
    images: [{ url: "https://sol.new/og-token.png", width: 1200, height: 630, alt: "Launch a Token on sol.new" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Launch a Token — sol.new",
    description: "Create your token on pump.fun's bonding curve — free, passkey-secured, no seed phrase.",
    creator: "@soldotnew",
    images: ["https://sol.new/og-token.png"],
  },
};

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
