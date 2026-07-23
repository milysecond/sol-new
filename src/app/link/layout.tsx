import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Short links — sol.new",
  description: "Create short sol.new/l/… links. Random codes free; custom codes 0.01 SOL.",
  openGraph: {
    title: "Short links — sol.new",
    description: "Turn any URL into a short sol.new link.",
    url: "https://sol.new/link",
  },
};

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
