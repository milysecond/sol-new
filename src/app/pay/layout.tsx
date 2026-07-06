import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Create a Solana Pay Link — sol.new",
  description:
    "Create a Solana Pay link anyone can pay with — in SOL or USDC. Share a link or QR code and get paid instantly. No app or signup required.",
  path: "/pay",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
