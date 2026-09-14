import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Wrap SOL on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Wrap",
    title: "SOL to wSOL",
    subtitle: "Wrap and unwrap with Face ID.",
    cta: "Open /wrap",
    accent: "cyan",
    path: "sol.new/wrap",
  });
}
