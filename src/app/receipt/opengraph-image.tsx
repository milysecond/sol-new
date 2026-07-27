import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Solana transaction receipts on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Receipt",
    title: "Share a receipt",
    subtitle: "Beautiful transaction cards from any Solana signature.",
    cta: "Look up a tx",
    accent: "purple",
    path: "sol.new/receipt",
  });
}
