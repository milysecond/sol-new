import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import RentPage from "./rent-client";

export const metadata: Metadata = pageMeta({
  title: "Minimum Rent — sol.new",
  description:
    "Live Solana minimum rent-exempt balance in lamports, SOL, and USD. Token account (165 bytes) + system account.",
  path: "/rent",
});

export default function Page() {
  return <RentPage />;
}
