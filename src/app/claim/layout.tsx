import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

// Audit H3: render per request so Next.js stamps the CSP nonce on its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "You've been sent crypto — sol.new",
  description:
    "Someone sent you crypto. Claim it in seconds with Face ID or fingerprint. No app, no seed phrase, no signup.",
  path: "/claim",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
