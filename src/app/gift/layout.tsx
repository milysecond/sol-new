import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

// Audit H3: render per request so Next.js stamps the CSP nonce on its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Send any Solana token with a link — sol.new",
  description:
    "Gift SOL, USDC, WSOL, or any SPL token with a claimable link. Recipient claims with Face ID — no app, no seed phrase.",
  path: "/gift",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
