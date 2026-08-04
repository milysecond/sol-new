import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "POAP drops on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "POAP",
    title: "Proof you were there",
    subtitle: "Create a drop · share link or QR · claim with Face ID",
    cta: "Create a drop",
    accent: "purple",
    path: "sol.new/poap",
  });
}
