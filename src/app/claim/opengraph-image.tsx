import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "You've been sent SOL — claim it on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "You've got crypto",
    title: "Someone sent you SOL 🎁",
    subtitle: "Claim it in seconds with Face ID or fingerprint. No app, no seed phrase, no signup.",
    cta: "Claim your SOL →",
  });
}
