import { brandOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "sol.new — Create on Solana with passkeys";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return brandOgImage();
}
