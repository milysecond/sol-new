import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Solana Pay on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Pay",
    title: "Get paid on Solana",
    subtitle: "Payment link or QR in SOL or USDC. Passkey wallet ready.",
    cta: "Create pay link",
    accent: "green",
    path: "sol.new/pay",
  });
}
