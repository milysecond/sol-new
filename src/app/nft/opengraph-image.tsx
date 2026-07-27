import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Mint an NFT on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "NFT",
    title: "Mint an NFT",
    subtitle: "Standard or compressed. Upload an image and mint with Face ID.",
    cta: "Mint now",
    accent: "green",
    path: "sol.new/nft",
  });
}
