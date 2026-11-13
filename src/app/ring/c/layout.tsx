import type { Metadata } from "next";
import { headers } from "next/headers";
import { pageMeta } from "@/lib/seo";
import { socialPreviewRobots } from "@/lib/social-crawlers";

// Generic on purpose: a pay link's amount is private, and the secret never reaches the server.
export async function generateMetadata(): Promise<Metadata> {
  const ua = (await headers()).get("user-agent");
  return {
    ...pageMeta({
      title: "A private payment for you — sol.new",
      description: "Claim it with Face ID into your own private balance. The amount stays hidden on-chain.",
      path: "/ring/c",
      image: "https://sol.new/ring/c/opengraph-image",
    }),
    robots: socialPreviewRobots(ua),
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
