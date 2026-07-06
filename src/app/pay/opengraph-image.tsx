import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Create a Solana Pay link with sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Solana payments",
    title: "Get paid in SOL or USDC",
    subtitle: "Create a Solana Pay link anyone can pay with. Share a link or QR code — no app, no signup.",
    cta: "Create a link →",
  });
}
