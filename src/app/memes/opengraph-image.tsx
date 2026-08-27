import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Make memes on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Memes",
    title: "Caption it. Ship it.",
    subtitle: "Drag text on classic blanks. Free with a sol.new mark — 0.01 SOL for clean PNG.",
    cta: "Make a meme",
    accent: "pink",
    path: "sol.new/memes",
  });
}
