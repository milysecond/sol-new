import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kill Switch — sol.new",
  description: "Emergency abort for upgradeable Solana programs. Deploy a 352-byte kill switch in one transaction.",
  openGraph: {
    title: "Kill Switch — sol.new",
    description: "Emergency abort for upgradeable Solana programs.",
  },
};

export default function KillLayout({ children }: { children: React.ReactNode }) {
  return children;
}
