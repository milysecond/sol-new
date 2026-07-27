import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Split a bill on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Split",
    title: "Split the bill",
    subtitle: "Share payment links and track who paid. On Solana.",
    cta: "Start a split",
    accent: "blue",
    path: "sol.new/split",
  });
}
