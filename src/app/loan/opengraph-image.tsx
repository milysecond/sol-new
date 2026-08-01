import { featureOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Lend and borrow on sol.new";
export const size = ogSize;
export const contentType = ogContentType;

export default async function Image() {
  return featureOgImage({
    eyebrow: "Loan",
    title: "Lend & borrow",
    subtitle: "Earn on deposits or borrow against collateral. Passkey-secured.",
    cta: "Open /loan",
    accent: "green",
    path: "sol.new/loan",
  });
}
