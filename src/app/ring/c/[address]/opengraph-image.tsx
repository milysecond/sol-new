import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "A private payment for you on sol.new";
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: "Ring · pay link",
    title: "A private payment for you",
    subtitle: "Claim it with Face ID. The amount stays hidden.",
    cta: "Claim",
    accent: "green",
    path: "sol.new/ring/c",
  });
}
