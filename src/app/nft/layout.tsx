import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Mint an NFT — sol.new",
  description:
    "Turn any image into an NFT on Solana. Standard or compressed, passkey-secured. Upload, name it, and mint instantly.",
  path: "/nft",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
