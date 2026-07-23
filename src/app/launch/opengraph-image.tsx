import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Launch a token on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Launch",
    title: "Ship a memecoin",
    subtitle: "Bonding curve launches. Passkey creator wallet. Free to create.",
    cta: "Launch now",
    accent: "orange",
    path: "sol.new/launch",
  });
}
