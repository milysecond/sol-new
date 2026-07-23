import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Send crypto gifts on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Gift",
    title: "Send with a link",
    subtitle: "SOL or USDC as a claimable gift. Recipient claims with Face ID.",
    cta: "Send a gift",
    accent: "pink",
    path: "sol.new/gift",
  });
}
