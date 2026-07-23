import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Browse NFTs on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "NFTs",
    title: "Browse by wallet",
    subtitle: "On-chain inventory, price sort, filters. Tensor and Magic Eden links.",
    cta: "Browse NFTs",
    accent: "purple",
    path: "sol.new/nfts",
  });
}
