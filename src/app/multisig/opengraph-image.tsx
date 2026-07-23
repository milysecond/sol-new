import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Create a multisig on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Multisig",
    title: "Shared wallets",
    subtitle: "Squads v4 multisig with multiple signers. Passkey members.",
    cta: "Create multisig",
    accent: "blue",
    path: "sol.new/multisig",
  });
}
