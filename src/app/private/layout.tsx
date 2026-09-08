import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Private - ZK and Rings - sol.new",
  description:
    "Privacy Cash ZK on mainnet. Helius Rings confidential transfers on devnet. Also /anon and /prv8.",
  path: "/private",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
