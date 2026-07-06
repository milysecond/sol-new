import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Best Solana & Crypto Podcasts — sol.new",
  description:
    "A hand-picked list of the top Solana and crypto podcasts. Listen on Spotify, Apple Podcasts, or YouTube — from builders and markets to deep tech.",
  path: "/pods",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
