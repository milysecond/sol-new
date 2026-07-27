import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Claim a crypto gift on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Claim",
    title: "You received crypto",
    subtitle: "Open the gift link and claim with Face ID. No app install.",
    cta: "Claim gift",
    accent: "pink",
    path: "sol.new/claim",
  });
}
