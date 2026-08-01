import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Swap tokens on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Swap",
    title: "Swap tokens",
    subtitle: "SOL, USDC, and any mint. Passkey. Jupiter Ultra.",
    cta: "Open /swap",
    accent: "purple",
    path: "sol.new/swap",
  });
}
