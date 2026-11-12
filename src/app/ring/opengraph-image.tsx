import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Private balances and pay links on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Ring · beta",
    title: "Private pay links",
    subtitle: "Amounts stay hidden. Claim with Face ID.",
    cta: "Open Ring",
    accent: "green",
    path: "sol.new/ring",
  });
}
