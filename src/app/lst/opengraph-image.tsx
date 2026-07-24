import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Liquid stake liquid stake on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Liquid stake",
    title: "Liquid stake SOL",
    subtitle: "jitoSOL, mSOL, INF, and more. Stay liquid while earning.",
    cta: "Get LSTs",
    accent: "cyan",
    path: "sol.new/lst",
  });
}
