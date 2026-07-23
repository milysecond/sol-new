import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Reclaim SOL rent on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Burn",
    title: "Reclaim rent",
    subtitle: "Close empty token accounts and get SOL back. Passkey-signed.",
    cta: "Scan wallet",
    accent: "orange",
    path: "sol.new/burn",
  });
}
