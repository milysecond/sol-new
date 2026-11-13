import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Solana Explorer — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new · explorer',
    title: 'Solana Explorer',
    subtitle: 'Look up wallets, tokens, programs, and transactions right inside sol.new.',
    cta: 'Open explorer',
    accent: 'cyan',
    path: 'sol.new/explorer',
  });
}
