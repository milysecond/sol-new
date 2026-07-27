import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Passkey Solana wallet on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Wallet",
    title: "Passkey wallet",
    subtitle: "Face ID or fingerprint. No seed phrases. Send, receive, and earn.",
    cta: "Open wallet",
    accent: "pink",
    path: "sol.new/wallet",
  });
}
