import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "sol.new — Create anything on Solana",
  description:
    "Tokens, NFTs, wallets, payments, and splits on Solana. Passkey-secured, no installs, no seed phrases. Start in seconds.",
  // Preview/alternate landing — keep it out of the index so it doesn't compete
  // with the primary homepage at "/".
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
