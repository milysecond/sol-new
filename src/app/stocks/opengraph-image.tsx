import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Tokenized stocks on Solana — sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Stocks",
    title: "Stocks on Solana",
    subtitle: "Screener for tokenized equities. Prices, liquidity, and premium to the real market.",
    cta: "Browse stocks",
    accent: "blue",
    path: "sol.new/stocks",
  });
}
