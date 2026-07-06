import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "You've Been Sent SOL 🎁 — sol.new",
  description:
    "Someone sent you SOL! Claim it in seconds with Face ID or fingerprint. No app, no seed phrase, no signup.",
  path: "/claim",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
