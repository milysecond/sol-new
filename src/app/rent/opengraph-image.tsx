import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Minimum Rent & Reclaim — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new · rent',
    title: 'Minimum Rent',
    subtitle: 'Live Solana rent costs in SOL and USD. Close empty token accounts gasless.',
    cta: 'Reclaim SOL',
    accent: 'green',
    path: 'sol.new/rent',
  });
}
