import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Send SOL or USDC with a Link — sol.new",
  description:
    "Gift SOL or dollars (USDC) to anyone with just a link — even if they don't have a wallet. They claim it in seconds with Face ID. No app, no seed phrase, no signup.",
  path: "/gift",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
