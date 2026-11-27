import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

// Audit H3: render per request so Next.js stamps the CSP nonce on its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Your Solana Wallet — sol.new",
  description:
    "A Solana wallet secured by passkeys. Get USDC, send payments, and manage your tokens and NFTs.",
  path: "/wallet",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
