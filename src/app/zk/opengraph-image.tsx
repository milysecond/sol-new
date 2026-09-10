import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "ZK on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "ZK",
    title: "zk.sol.new docs",
    subtitle: "Live OpenAPI. Shield and prove on Solana.",
    cta: "Open /zk",
    accent: "purple",
    path: "sol.new/zk",
  });
}
