import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Launch a Token — sol.new",
  description: "Launch a meme coin on Solana. Free creation, Raydium graduation built in.",
  path: "/launch",
});

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
