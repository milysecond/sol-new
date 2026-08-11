import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscriptions · sol.new",
  description: "Credits and on-chain USDC subscription plans for sol.new.",
  openGraph: {
    title: "sol.new Subscriptions",
    description: "A$5 credits + USDC plans.",
    url: "https://sol.new/sub",
  },
};

export default function SubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
