import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Features at a glance — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new',
    title: 'Features at a glance',
    subtitle: 'Wallet, tokens, NFTs, pay, gifts, receipts, fair draws, and more.',
    cta: 'Explore tools',
    accent: 'purple',
    path: 'sol.new/features',
  });
}
