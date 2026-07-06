import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Live World Cup 2026 odds on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "World Cup 2026",
    title: "Live odds, no margin",
    subtitle: "Fair, de-margined World Cup odds from the TXODDS oracle — verified on Solana.",
    cta: "See the odds →",
  });
}
