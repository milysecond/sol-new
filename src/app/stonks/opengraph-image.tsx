import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Top stonks on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Stonks",
    title: "Top stonks",
    subtitle: "Highest market cap. Full screener at stonkscreener.com.",
    cta: "Open /stonks",
    accent: "green",
    path: "sol.new/stonks",
  });
}
