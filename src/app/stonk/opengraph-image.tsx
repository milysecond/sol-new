import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Launch on StonkFun from sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "StonkFun",
    title: "Launch vs stocks",
    subtitle: "Pair a new coin with NVDAx, SPYx, SOL, or another mint.",
    cta: "Create on /stonk",
    accent: "green",
    path: "sol.new/stonk",
  });
}
