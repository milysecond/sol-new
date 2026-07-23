import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Earn USDC — sol.new",
  description: "Earn Protected stablecoin yield via Lulo. Passkey wallet, deposit and withdraw USDC.",
  path: "/earn",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
