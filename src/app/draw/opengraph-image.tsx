import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Fair draws with verifiable randomness on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Fair draws",
    title: "Wheel · coin · dice",
    subtitle:
      "Spin a wheel, flip a coin, or roll the dice. Provably fair picks with a shareable receipt.",
    cta: "Draw a winner →",
  });
}
