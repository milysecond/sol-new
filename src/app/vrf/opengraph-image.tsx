import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Fair draws with verifiable randomness on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Verifiable randomness",
    title: "Fair draws anyone can audit",
    subtitle:
      "Raffle winners, coin flips, and dice — entropy from Solana, ProofNetwork, and MagicBlock VRF.",
    cta: "Draw a winner →",
  });
}
