import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import BridgePage from "./bridge-client";

export const metadata: Metadata = pageMeta({
  title: "Bridge USDC to Solana — sol.new",
  description:
    "Send USDC from Base, Arbitrum, Ethereum, or Sui. GUM Universal Deposit lands it as USDC in your Solana wallet.",
  path: "/bridge",
});

export default function Page() {
  return <BridgePage />;
}
