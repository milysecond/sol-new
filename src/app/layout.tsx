import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "sol.new — Create anything on Solana",
  description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. No wallet, no fees, no friction.",
  openGraph: {
    title: "sol.new",
    description: "Create anything on Solana",
    url: "https://sol.new",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
