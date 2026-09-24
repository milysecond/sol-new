import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Bridge USDC to Solana on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Bridge",
    title: "USDC in. Solana out.",
    subtitle: "Send from Base, Arbitrum, Ethereum, or Sui. GUM lands USDC in your wallet.",
    cta: "Get deposit address",
    accent: "cyan",
    path: "sol.new/bridge",
  });
}
