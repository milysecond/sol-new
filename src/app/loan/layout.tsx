import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Lend & borrow — sol.new",
  description:
    "Supply assets to earn yield or borrow against collateral on Solana. Passkey wallet. Face ID.",
  path: "/loan",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
