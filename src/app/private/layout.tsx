import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "ZK Privacy — shield & send privately — sol.new",
  description:
    "Zero-knowledge private SOL on Solana via Privacy Cash. Shield, hold, and send with no public link to the recipient.",
  path: "/private",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
