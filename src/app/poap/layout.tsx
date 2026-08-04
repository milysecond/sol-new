import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POAP · Proof of attendance · sol.new",
  description:
    "Mint a memory. Drop a claim link or QR. Collectors claim with Face ID and receive a free compressed NFT on Solana.",
  openGraph: {
    title: "POAP on sol.new",
    description: "On-chain proof-of-attendance. Create → share → claim cNFT.",
    url: "https://sol.new/poap",
  },
};

export default function PoapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
