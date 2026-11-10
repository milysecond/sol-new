import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Launch a coin on Float from sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Float",
    title: "Launch a coin",
    subtitle: "Through Float's program. Pair with a stock, SOL, or USDC.",
    cta: "Launch on Float",
    accent: "cyan",
    path: "sol.new/float",
  });
}
