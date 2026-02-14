import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Multisig — sol.new",
  description: "Create shared wallets with multiple signers on Solana. Secure your funds with multisig. Set up in seconds with passkeys.",
  openGraph: {
    title: "Create a Multisig — sol.new",
    description: "Shared wallets with multiple signers on Solana. Secure and simple.",
    url: "https://sol.new/multisig",
    siteName: "sol.new",
    images: [{ url: "https://sol.new/og-multisig.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create a Multisig — sol.new",
    description: "Shared wallets with multiple signers on Solana. Passkey-secured, low fees.",
    images: ["https://sol.new/og-multisig.png"],
    creator: "@soldotnew",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
