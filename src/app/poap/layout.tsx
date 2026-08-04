import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POAP · Proof of attendance · sol.new",
  description:
    "Mint a memory. Drop a claim link or QR. Collectors claim with Face ID — proof you were there.",
  openGraph: {
    title: "POAP on sol.new",
    description: "Proof-of-attendance drops. Create → share → claim.",
    url: "https://sol.new/poap",
  },
};

export default function PoapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
