import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Fair draws on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Fair draw",
    title: "Wheel · coin · dice",
    subtitle: "Provably fair picks with a shareable result. One free try per mode.",
    cta: "Draw a winner",
    accent: "orange",
    path: "sol.new/draw",
  });
}
