import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POS — Point of sale · sol.new",
  description: "Charge customers with Solana Pay QR. Tips, USDC or SOL, live payment confirm.",
  openGraph: {
    title: "sol.new POS",
    description: "Point of sale on Solana — QR charge, tip, confirm.",
    url: "https://sol.new/pos",
  },
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
