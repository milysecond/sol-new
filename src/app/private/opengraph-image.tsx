import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Private SOL on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Private",
    title: "ZK shield and Rings",
    subtitle: "Privacy Cash on mainnet. Helius Rings on devnet. /private /anon /prv8.",
    cta: "Open private wallet",
    accent: "purple",
    path: "sol.new/private",
  });
}
