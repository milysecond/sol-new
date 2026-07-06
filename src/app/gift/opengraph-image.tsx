import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Send SOL with a link on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Crypto gifting",
    title: "Send SOL or USDC with a link",
    subtitle: "Gift crypto or dollars to anyone — even without a wallet. They claim it in seconds with Face ID.",
    cta: "Create a gift link →",
  });
}
