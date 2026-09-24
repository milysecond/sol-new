import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "prv8 - private SOL - sol.new",
  description: "Alias of /private. Privacy Cash ZK and Helius Rings.",
  path: "/prv8",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
