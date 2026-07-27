import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Stake SOL on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Stake",
    title: "Native SOL staking",
    subtitle: "Delegate to a validator. Passkey signs every move.",
    cta: "Stake SOL",
    accent: "purple",
    path: "sol.new/stake",
  });
}
