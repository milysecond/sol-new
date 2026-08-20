import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import RentPage from "./rent-client";

export const metadata: Metadata = pageMeta({
  title: "Minimum Rent — sol.new",
  description:
    "Live Solana rent costs in lamports, SOL, and USD. Close empty token accounts gasless and reclaim rent.",
  path: "/rent",
});

export default function Page() {
  return <RentPage />;
}
