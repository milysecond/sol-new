import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Earn USDC with Lulo on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Earn",
    title: "Protected USDC yield",
    subtitle: "Deposit and withdraw with your passkey. No seed phrases.",
    cta: "Start earning",
    accent: "cyan",
    path: "sol.new/earn",
  });
}
