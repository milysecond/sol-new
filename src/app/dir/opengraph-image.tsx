import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = 'Directory — sol.new';
export const size = ogSize;
export const contentType = ogContentType;
export const runtime = "nodejs";

export default async function Image() {
  return featureOgImage({
    eyebrow: 'sol.new · directory',
    title: 'Everything on sol.new',
    subtitle: 'All passkey-secured Solana tools on one page: create, pay, swap, and explore.',
    cta: 'Browse directory',
    accent: 'blue',
    path: 'sol.new/dir',
  });
}
