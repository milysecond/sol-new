import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Create a token on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Token",
    title: "Launch a token",
    subtitle: "SPL token on Solana in seconds. Passkey-secured. Low fees.",
    cta: "Create token",
    accent: "orange",
    path: "sol.new/token",
  });
}
