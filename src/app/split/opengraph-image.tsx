import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Split a bill on Solana with sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Solana payments",
    title: "Split a bill, get paid in seconds",
    subtitle: "Split any bill with friends in SOL or USDC. Add a tip, share a link or QR, track who's paid.",
    cta: "Split a bill →",
  });
}
