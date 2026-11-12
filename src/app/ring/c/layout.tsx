import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

// Generic on purpose: a pay link's amount is private, and the secret never reaches the server.
export const metadata: Metadata = {
  ...pageMeta({
    title: "A private payment for you — sol.new",
    description: "Claim it with Face ID into your own private balance. The amount stays hidden on-chain.",
    path: "/ring/c",
  }),
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
