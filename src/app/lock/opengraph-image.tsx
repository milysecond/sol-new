import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Lock tokens on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Lock",
    title: "Lock tokens until a date",
    subtitle: "Cliff unlock on Jupiter Lock. Passkey signs. No protocol fee.",
    cta: "Lock tokens",
    accent: "orange",
    path: "sol.new/lock",
  });
}
