import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "sol.new — Launch a Solana token in seconds",
  description: "The fastest way to create a token on Solana. No wallet, no fees, no friction.",
  openGraph: {
    title: "sol.new",
    description: "Launch a Solana token in seconds",
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
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
