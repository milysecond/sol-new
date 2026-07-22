import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Solana transaction receipts on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Transaction receipts",
    title: "Verify any Solana payment",
    subtitle:
      "Paste a signature. Get a clean, shareable receipt with amount, memo, and USD value.",
    cta: "Check a receipt →",
  });
}
