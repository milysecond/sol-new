import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "ZK on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "ZK",
    title: "Shield on zk.sol.new",
    subtitle: "Passkey ZK. Relayer + indexer on zk.sol.new.",
    cta: "Open /zk",
    accent: "purple",
    path: "sol.new/zk",
  });
}
