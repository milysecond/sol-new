import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Solana Portfolio — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new · portfolio',
    title: 'Wallet Portfolio',
    subtitle: 'Token balances, Jupiter DeFi positions, and assets for any Solana wallet.',
    cta: 'View portfolio',
    accent: 'purple',
    path: 'sol.new/portfolio',
  });
}
