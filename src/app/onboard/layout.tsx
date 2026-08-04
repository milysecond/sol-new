import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get started · sol.new",
  description:
    "Create a Face ID Solana wallet in seconds. Then gift, swap, or stake — your first real win on sol.new.",
  openGraph: {
    title: "Get started · sol.new",
    description: "Wallet in Face ID. Value first. One clear next step.",
    url: "https://sol.new/onboard",
  },
  robots: { index: true, follow: true },
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
