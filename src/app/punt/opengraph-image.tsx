import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Punt free picks on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Punt",
    title: "Free match picks",
    subtitle: "Points and leaderboard only. No stakes. No payouts.",
    cta: "Make a pick",
    accent: "green",
    path: "sol.new/punt",
  });
}
