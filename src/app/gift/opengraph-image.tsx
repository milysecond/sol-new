import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Send crypto gifts on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Gift",
    title: "Send with a link",
    subtitle: "Any SPL token as a claimable gift. Face ID claim — no app.",
    cta: "Send a gift",
    accent: "pink",
    path: "sol.new/gift",
  });
}
