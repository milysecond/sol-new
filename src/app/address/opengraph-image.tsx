import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Address lookup — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new · address',
    title: 'Address lookup',
    subtitle: 'Inspect any Solana wallet, token mint, or program on sol.new.',
    cta: 'Look up address',
    accent: 'cyan',
    path: 'sol.new/address',
  });
}
